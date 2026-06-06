import 'react';

declare namespace NodeJS {
  interface ProcessEnv {
    API_PROXY_TARGET?: string;
    UMI_APP_API_BASE_URL?: string;
    UMI_APP_USER_ID?: string;
  }
}

declare module 'react' {
  interface CSSProperties {
    [key: `--${string}`]: string | number;
  }
}
