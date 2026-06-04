import React from 'react';
import { XProvider } from '@ant-design/x';
import { Provider as ReduxProvider } from 'react-redux';
import { store } from './store';

export { request } from './service/request';

export function rootContainer(container: React.ReactElement) {
  return React.createElement(ReduxProvider, {
    store,
    children: React.createElement(XProvider, null, container),
  });
}
