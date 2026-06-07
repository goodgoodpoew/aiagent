export const LOCATION_ACQUISITION_TOOL_NAME = 'location_acquisition';

export interface ClientLocationInput {
  latitude: number;
  longitude: number;
  accuracy?: number;
  label?: string;
}

export interface LocationAcquisitionToolArguments {
  location: string;
}

export interface LocationAcquisitionToolResult {
  location: string;
  contextText: string;
}

export function parseClientLocation(value: unknown): ClientLocationInput | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Partial<ClientLocationInput>;
  if (typeof input.latitude !== 'number' || typeof input.longitude !== 'number') return null;
  if (!Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90) return null;
  if (!Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180) return null;

  const accuracy = typeof input.accuracy === 'number' && Number.isFinite(input.accuracy) && input.accuracy >= 0
    ? input.accuracy
    : undefined;
  const label = typeof input.label === 'string' ? input.label.trim().slice(0, 200) : undefined;

  return {
    latitude: input.latitude,
    longitude: input.longitude,
    ...(accuracy !== undefined ? { accuracy } : {}),
    ...(label ? { label } : {}),
  };
}

export function formatClientLocation(location: ClientLocationInput): string {
  if (location.label) {
    return location.label;
  }

  const latDir = location.latitude >= 0 ? '北纬' : '南纬';
  const lngDir = location.longitude >= 0 ? '东经' : '西经';
  const parts = [
    `${latDir} ${Math.abs(location.latitude).toFixed(4)}°`,
    `${lngDir} ${Math.abs(location.longitude).toFixed(4)}°`,
  ];

  if (location.accuracy !== undefined) {
    parts.push(`精度约 ${Math.round(location.accuracy)} 米`);
  }

  return parts.join('，');
}

export function parseLocationAcquisitionArguments(
  args: Record<string, unknown>,
): LocationAcquisitionToolArguments | null {
  const location = typeof args.location === 'string' ? args.location.trim() : '';
  if (!location) return null;
  return { location };
}

export function isLocationAcquisitionToolResult(value: unknown): value is LocationAcquisitionToolResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<LocationAcquisitionToolResult>;
  return typeof result.location === 'string' && typeof result.contextText === 'string';
}

export function buildLocationAcquisitionContext(location: string): string {
  return `用户当前位置：${location}`;
}
