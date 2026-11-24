import { Box, MenuItem, TextField, Typography } from '@mui/material';
import { useClinic } from '../contexts/ClinicContext';
import { clinicCompanyKey, groupClinicBranches } from '../utils/clinicBranches';

export default function ClinicSelector() {
  const { availableClinics, currentClinic, setCurrentClinic, loadingClinics } = useClinic();
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
          if (company) setCurrentClinic(company.branches[0]);
        }}>
        {companies.map(company => <MenuItem key={company.key} value={company.key}>{company.name}</MenuItem>)}
      </TextField>
      {selected.branches.length > 1 ? (
        <TextField select size="small" label="Branch" value={currentClinic.id}
          sx={{ minWidth: 140, maxWidth: { xs: '100%', sm: 260 } }}
          onChange={event => {
            const branch = selected.branches.find(clinic => clinic.id === event.target.value);
            if (branch) setCurrentClinic(branch);
          }}>
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
