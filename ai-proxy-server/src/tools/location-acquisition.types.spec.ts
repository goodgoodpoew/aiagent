import {
  formatClientLocation,
  parseClientLocation,
  parseLocationAcquisitionArguments,
} from './location-acquisition.types';

describe('location-acquisition.types', () => {
  it('校验并归一化 clientLocation', () => {
    expect(parseClientLocation({
      latitude: 31.23,
      longitude: 121.47,
      accuracy: 20,
      label: '  上海市  ',
    })).toEqual({
      latitude: 31.23,
      longitude: 121.47,
      accuracy: 20,
      label: '上海市',
    });
  });

  it('拒绝非法坐标', () => {
    expect(parseClientLocation({ latitude: 120, longitude: 10 })).toBeNull();
    expect(parseClientLocation({ latitude: 10, longitude: 999 })).toBeNull();
  });

  it('优先使用 label，否则格式化坐标', () => {
    expect(formatClientLocation({
      latitude: 31.2304,
      longitude: 121.4737,
      label: '上海市黄浦区',
    })).toBe('上海市黄浦区');

    expect(formatClientLocation({
      latitude: 31.2304,
      longitude: -121.4737,
      accuracy: 42.6,
    })).toBe('北纬 31.2304°，西经 121.4737°，精度约 43 米');
  });

  it('解析工具 location 参数', () => {
    expect(parseLocationAcquisitionArguments({ location: ' 北京 ' })).toEqual({
      location: '北京',
    });
    expect(parseLocationAcquisitionArguments({})).toBeNull();
  });
});
