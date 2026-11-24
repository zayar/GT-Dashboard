import { useEffect } from 'react';
import { Alert } from '@mui/material';
import { Outlet, useSearchParams } from 'react-router-dom';
import { useClinic } from '../contexts/ClinicContext';
import { clinicCompanyKey } from '../utils/clinicBranches';

export default function ReportDetailBranch() {
  const [query] = useSearchParams();
  const { availableClinics, currentClinic, openBranchDetails } = useClinic();
  const requested = query.get('branch');
  const branch = requested && currentClinic
    ? availableClinics.find(clinic => clinic.id === requested && clinicCompanyKey(clinic) === clinicCompanyKey(currentClinic))
    : undefined;
  useEffect(() => {
    if (branch && currentClinic?.id !== branch.id) openBranchDetails(branch);
  }, [branch, currentClinic, openBranchDetails]);
  if (requested && !branch) return <Alert severity="warning">This branch is unavailable for the selected company.</Alert>;
  if (branch && currentClinic?.id !== branch.id) return null;
  return <Outlet key={currentClinic?.id} />;
}
