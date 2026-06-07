import type { ChatContextInput } from '@/service/stream-protocol';

export type ClientLocationInput = NonNullable<ChatContextInput['clientLocation']>;

export type ClientLocationErrorCode =
  | 'UNSUPPORTED'
  | 'PERMISSION_DENIED'
  | 'TIMEOUT'
  | 'POSITION_UNAVAILABLE';

export type ClientLocationResult =
  | { ok: true; location: ClientLocationInput }
  | { ok: false; code: ClientLocationErrorCode; message: string };

const GEOLOCATION_TIMEOUT_MS = 8_000;
const REVERSE_GEOCODE_TIMEOUT_MS = 4_000;

function mapGeolocationError(error: GeolocationPositionError): ClientLocationResult {
  if (error.code === error.PERMISSION_DENIED) {
    return {
      ok: false,
      code: 'PERMISSION_DENIED',
      message: '浏览器未授权位置权限',
    };
  }
  if (error.code === error.TIMEOUT) {
    return {
      ok: false,
      code: 'TIMEOUT',
      message: '获取位置超时',
    };
  }
  return {
    ok: false,
    code: 'POSITION_UNAVAILABLE',
    message: '当前无法获取位置',
  };
}

function isGeolocationPositionError(error: unknown): error is GeolocationPositionError {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && typeof (error as GeolocationPositionError).code === 'number',
  );
}

async function reverseGeocodeLabel(location: ClientLocationInput): Promise<string | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REVERSE_GEOCODE_TIMEOUT_MS);

  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', String(location.latitude));
    url.searchParams.set('lon', String(location.longitude));
    url.searchParams.set('accept-language', 'zh-CN');

    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });
    if (!response.ok) return undefined;

    const payload = await response.json() as { display_name?: string };
    const label = typeof payload.display_name === 'string' ? payload.display_name.trim() : '';
    return label ? label.slice(0, 200) : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

export async function acquireClientLocation(options?: {
  reverseGeocode?: boolean;
}): Promise<ClientLocationResult> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return {
      ok: false,
      code: 'UNSUPPORTED',
      message: '当前环境不支持浏览器定位',
    };
  }

  try {
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: GEOLOCATION_TIMEOUT_MS,
        maximumAge: 60_000,
      });
    });

    const location: ClientLocationInput = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      ...(Number.isFinite(position.coords.accuracy)
        ? { accuracy: position.coords.accuracy }
        : {}),
    };

    if (options?.reverseGeocode !== false) {
      const label = await reverseGeocodeLabel(location);
      if (label) {
        location.label = label;
      }
    }

    return { ok: true, location };
  } catch (error) {
    if (isGeolocationPositionError(error)) {
      return mapGeolocationError(error);
    }
    return {
      ok: false,
      code: 'POSITION_UNAVAILABLE',
      message: '当前无法获取位置',
    };
  }
}

export const LOCATION_ACQUISITION_TOOL_REF = {
  source: 'builtin' as const,
  name: 'location_acquisition',
};
