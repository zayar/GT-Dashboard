import { renderToStaticMarkup as render } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Dashboard from './Dashboard';
import DailyReport from './DailyReport';

const sources = vi.hoisted(() => ({ accounting: vi.fn(), warehouse: vi.fn() }));
vi.mock('../hooks/useBiAccounting', () => ({ useBiActivity: sources.accounting }));
vi.mock('../hooks/useReportSection', () => ({ useReportSection: sources.warehouse }));
vi.mock('../contexts/ClinicContext', () => ({
  useClinic: () => ({ currentClinic: { id: 'a', code: 'A', name: 'Clinic A' }, loadingClinics: false }),
}));
vi.mock('react-apexcharts', () => ({ default: () => null }));
vi.mock('react-chartjs-2', () => ({ Line: () => null }));
vi.mock('react-router-dom', () => ({ useNavigate: () => () => undefined }));

const pending = { loading: true, data: null, error: null };
const ready = (data: unknown) => ({ loading: false, data, error: null });
const accounting = { grossSales: 36500, invoiceCount: 2, paymentsReceived: 22000, paymentCount: 3 };
const activity = { customers: 27, services: 8, appointmentsPerCustomer: 1.25 };
const visit = { CustomerName: 'Fixture visitor', CustomerPhoneNumber: '123', CustomerId: 'm1',
  ServiceName: 'Fixture service', PractitionerName: 'Practitioner', IsNewCustomer: 'Yes' };

describe('BI overview sections', () => {
  beforeEach(() => {
    sources.accounting.mockReset().mockReturnValue(pending);
    sources.warehouse.mockReset().mockReturnValue(pending);
  });

  it('shows operational cards while the dashboard accounting request is pending', () => {
    sources.warehouse.mockReturnValue(ready({ current: activity, previous: activity }));
    const html = render(<Dashboard />);
    expect(html).toContain('Loading Gross Sales');
    expect(html).toContain('1.25x');
    expect(html).toContain('Unique customers');
    expect(html).not.toContain('Outstanding Balance');
  });

  it('shows the current accounting totals while comparisons and the warehouse are pending', () => {
    sources.accounting.mockReturnValueOnce(ready(accounting));
    const html = render(<Dashboard />);
    expect(html).toContain('36,500');
    expect(html).toContain('22,000');
    expect(html).toContain('Loading Unique customers');
  });

  it('keeps daily visits, export, and the date picker available after an accounting failure', () => {
    sources.accounting.mockReturnValue({ loading: false, data: null, error: 'Session expired' });
    sources.warehouse.mockReturnValue(ready([visit]));
    const html = render(<DailyReport />);
    expect(html).toContain('Session expired');
    expect(html).toContain('Fixture visitor');
    expect(html).toContain('Export to Excel');
    expect(html).toContain('Daily Performance');
    expect(html).not.toContain('Outstanding Balance');
    expect(html).not.toContain('0 invoices');
  });

  it('keeps daily sales visible while visits are loading or unavailable', () => {
    sources.accounting.mockReturnValue(ready(accounting));
    expect(render(<DailyReport />)).toContain('22,000');
    sources.warehouse.mockReturnValue({ loading: false, data: null, error: 'Warehouse offline' });
    const html = render(<DailyReport />);
    expect(html).toContain('Warehouse offline');
    expect(html).toContain('36,500');
    expect(html).not.toContain('No customers');
  });
});
