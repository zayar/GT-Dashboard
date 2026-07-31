export const getServiceDetailsPath = (serviceName: string) => (
  `/services/${encodeURIComponent(serviceName.trim())}`
);
