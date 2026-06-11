import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// ===== VEHICLES =====
export const getVehicles = async () => {
  const response = await axios.get(`${API}/vehicles`);
  return response.data;
};

export const getVehicle = async (vehicleId) => {
  const response = await axios.get(`${API}/vehicles/${vehicleId}`);
  return response.data;
};

export const createVehicle = async (vehicleData) => {
  const response = await axios.post(`${API}/vehicles`, vehicleData);
  return response.data;
};

export const updateVehicle = async (vehicleId, vehicleData) => {
  const response = await axios.put(`${API}/vehicles/${vehicleId}`, vehicleData);
  return response.data;
};

export const deleteVehicle = async (vehicleId) => {
  const response = await axios.delete(`${API}/vehicles/${vehicleId}`);
  return response.data;
};

// ===== DRIVERS =====
export const getDrivers = async () => {
  const response = await axios.get(`${API}/drivers`);
  return response.data;
};

export const getDriver = async (driverId) => {
  const response = await axios.get(`${API}/drivers/${driverId}`);
  return response.data;
};

export const createDriver = async (driverData) => {
  const response = await axios.post(`${API}/drivers`, driverData);
  return response.data;
};

export const updateDriver = async (driverId, driverData) => {
  const response = await axios.put(`${API}/drivers/${driverId}`, driverData);
  return response.data;
};

export const deleteDriver = async (driverId) => {
  const response = await axios.delete(`${API}/drivers/${driverId}`);
  return response.data;
};

// ===== INSPECTIONS =====
export const uploadInspection = async (vehicleId, driverId, files, notes = '') => {
  const formData = new FormData();
  formData.append('vehicle_id', vehicleId);
  if (driverId) formData.append('driver_id', driverId);
  formData.append('notes', notes);
  
  files.forEach((file) => {
    formData.append('files', file);
  });
  
  const response = await axios.post(`${API}/inspections/upload`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
  return response.data;
};

export const getInspections = async (vehicleId = null, limit = 100) => {
  const params = { limit };
  if (vehicleId) params.vehicle_id = vehicleId;
  const response = await axios.get(`${API}/inspections`, { params });
  return response.data;
};

export const getInspection = async (inspectionId) => {
  const response = await axios.get(`${API}/inspections/${inspectionId}`);
  return response.data;
};

// ===== ALERTS =====
export const getAlerts = async (unreadOnly = false) => {
  const params = { unread_only: unreadOnly };
  const response = await axios.get(`${API}/alerts`, { params });
  return response.data;
};

export const markAlertRead = async (alertId) => {
  const response = await axios.put(`${API}/alerts/${alertId}/read`);
  return response.data;
};

// ===== INCIDENTS =====
export const getIncidents = async (vehicleId = null) => {
  const params = {};
  if (vehicleId) params.vehicle_id = vehicleId;
  const response = await axios.get(`${API}/incidents`, { params });
  return response.data;
};

export const createIncident = async (incidentData) => {
  const response = await axios.post(`${API}/incidents`, incidentData);
  return response.data;
};

export const resolveIncident = async (incidentId) => {
  const response = await axios.put(`${API}/incidents/${incidentId}/resolve`);
  return response.data;
};

// ===== STATS =====
export const getDashboardStats = async () => {
  const response = await axios.get(`${API}/stats/dashboard`);
  return response.data;
};