import * as nock from 'nock';

beforeEach(() => {
  nock.disableNetConnect();
  nock.enableNetConnect(
    (host) =>
      host.startsWith('127.0.0.1') || host.startsWith('localhost') || host.startsWith('::1'),
  );
});

afterEach(() => {
  nock.cleanAll();
});

afterAll(() => {
  nock.enableNetConnect();
});
