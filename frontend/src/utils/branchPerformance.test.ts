import { describe, expect, it } from 'vitest';
import { mapAuthorizedClinics } from '../contexts/authSession';
import { groupClinicBranches } from './clinicBranches';
import { branchTotals } from './branchPerformance';

describe('company and branch scope', () => {
  it('groups only assigned clinics by the owning ID and keeps old entries with unknown ownership separate', () => {
    const clinic = (id: string, company_id?: string) => ({
      id, name: 'Same name', code: id, company_id, company: company_id ? { name: 'Same company name' } : null,
    });
    const allowed = mapAuthorizedClinics([clinic('a', 'one'), clinic('b', 'one'), clinic('c', 'two'),
      clinic('hidden', 'one'), clinic('legacy1'), clinic('legacy2')], ['a', 'b', 'c', 'legacy1', 'legacy2']);
    const groups = groupClinicBranches(allowed);
    expect(groups).toHaveLength(4);
    expect(groups.map(group => group.branches.map(branch => branch.id))).toContainEqual(['a', 'b']);
    expect(groups.find(group => group.key === 'company:two')?.branches.map(branch => branch.id)).toEqual(['c']);
    expect(allowed.some(branch => branch.id === 'hidden')).toBe(false);
  });

  it('totals activity across shown branches and separates money by currency', () => {
    const branch = { clinicId: 'a', clinicName: 'Branch A', currency: 'MMK', appointments: 4,
      completedServices: 3, invoiceCount: 2, grossSales: 1000, paymentsReceived: 800 };
    const totals = branchTotals([branch, { ...branch, clinicId: 'b' },
      { ...branch, clinicId: 'c', currency: 'USD', grossSales: 35, paymentsReceived: 25 }]);
    expect(totals.all).toEqual({ appointments: 12, completedServices: 9, invoiceCount: 6 });
    expect(totals.currencies.get('MMK')).toMatchObject({ grossSales: 2000, paymentsReceived: 1600 });
    expect(totals.currencies.get('USD')).toMatchObject({ grossSales: 35, paymentsReceived: 25 });
  });
});
