import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

export const lookupCnpj = (cnpj) => api.get(`/cnpj/${cnpj}`).then((r) => r.data);

export const uploadReceipt = (file, onProgress) => {
  const form = new FormData();
  form.append("file", file);
  return api
    .post("/uploads", form, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
      },
    })
    .then((r) => r.data);
};

export const fileUrl = (id) => `${API}/files/${id}`;

export const createRecord = (payload) => api.post("/records", payload).then((r) => r.data);
export const listRecords = (q) => api.get(`/records`, { params: q ? { q } : {} }).then((r) => r.data);
export const deleteRecord = (id) => api.delete(`/records/${id}`).then((r) => r.data);
export const getStats = () => api.get("/stats").then((r) => r.data);
