import { beforeEach, describe, expect, it, vi } from 'vitest';
import { acquireClientLocation } from './client-location';

describe('acquireClientLocation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('在不支持 geolocation 的环境返回 UNSUPPORTED', async () => {
    const originalNavigator = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {},
    });

    const result = await acquireClientLocation({ reverseGeocode: false });
    expect(result).toEqual({
      ok: false,
      code: 'UNSUPPORTED',
      message: '当前环境不支持浏览器定位',
    });

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: originalNavigator,
    });
  });

  it('成功获取坐标并可选写入逆地理标签', async () => {
    Object.defineProperty(globalThis.navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) => {
          success({
            coords: {
              latitude: 31.2304,
              longitude: 121.4737,
              accuracy: 35,
            },
          } as GeolocationPosition);
        },
      },
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ display_name: '上海市黄浦区' }),
    } as Response);

    const result = await acquireClientLocation();
    expect(result).toEqual({
      ok: true,
      location: {
        latitude: 31.2304,
        longitude: 121.4737,
        accuracy: 35,
        label: '上海市黄浦区',
      },
    });
  });

  it('权限拒绝时返回 PERMISSION_DENIED', async () => {
    Object.defineProperty(globalThis.navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) => {
          error({
            code: 1,
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
            message: 'denied',
          } as GeolocationPositionError);
        },
      },
    });

    const result = await acquireClientLocation({ reverseGeocode: false });
    expect(result).toMatchObject({
      ok: false,
      code: 'PERMISSION_DENIED',
    });
  });
});
