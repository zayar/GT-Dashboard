import { Box, MenuItem, TextField, Typography } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { branchReportPaths } from '../utils/reportBranches';
import { useClinic } from '../contexts/ClinicContext';
import { clinicCompanyKey, groupClinicBranches } from '../utils/clinicBranches';

export default function ClinicSelector() {
  const { availableClinics, currentClinic, setCurrentClinic, loadingClinics, reportBranches, selectAllReportBranches } = useClinic();
  const location = useLocation();
  const navigate = useNavigate();
  const supportsAll = branchReportPaths.has(location.pathname.replace(/\/$/, ''));
  const clearDetailBranch = () => {
    const query = new URLSearchParams(location.search);
    if (!query.has('branch')) return;
    query.delete('branch');
    navigate({ pathname: location.pathname, search: query.toString() }, { replace: true, state: location.state });
  };
  if (loadingClinics || !currentClinic) {
    return <Typography variant="body2">{loadingClinics ? 'Loading clinics…' : 'No clinics available.'}</Typography>;
  }

  const companies = groupClinicBranches(availableClinics);
  const selected = companies.find(company => company.key === clinicCompanyKey(currentClinic));
  if (!selected) return null;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', minWidth: 0 }}>
      <TextField select size="small" label="Company" value={selected.key}
        sx={{ minWidth: 140, maxWidth: { xs: '100%', sm: 260 } }}
        onChange={event => {
          const company = companies.find(group => group.key === event.target.value);
          if (company) { clearDetailBranch(); setCurrentClinic(company.branches[0]); }
        }}>
        {companies.map(company => <MenuItem key={company.key} value={company.key}>{company.name}</MenuItem>)}
      </TextField>
      {selected.branches.length > 1 ? (
        <TextField select size="small" label="Branch" value={supportsAll && reportBranches.length > 1 ? "*" : currentClinic.id}
          sx={{ minWidth: 140, maxWidth: { xs: '100%', sm: 260 } }}
          onChange={event => {
            if (supportsAll && event.target.value === '*') { selectAllReportBranches(); return; }
            clearDetailBranch();
            const branch = selected.branches.find(clinic => clinic.id === event.target.value);
            if (branch) setCurrentClinic(branch);
          }}>
          {supportsAll && <MenuItem value="*">All branches</MenuItem>}
          {selected.branches.map(branch => <MenuItem key={branch.id} value={branch.id}>{branch.name} · {branch.code}</MenuItem>)}
        </TextField>
      ) : (
        <Typography variant="body2" color="text.secondary">
          {selected.name === currentClinic.name ? currentClinic.code : currentClinic.name}
        </Typography>
      )}
    </Box>
  );
}
