import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

export const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('cbt_auth_v1');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export function setAuthToken(token) {
  if (token) api.defaults.headers.common.Authorization = `Bearer ${token}`;
  else delete api.defaults.headers.common.Authorization;
}

/** GET /api/... → triggers browser download of .xlsx */
export async function downloadExcel(path, fallbackFilename) {
  const res = await api.get(path, { responseType: 'blob' });
  const ctype = res.headers['content-type'] || '';
  if (ctype.includes('application/json')) {
    const text = await res.data.text();
    const err = JSON.parse(text);
    throw new Error(err.message || 'Download failed');
  }
  let name = fallbackFilename || 'export.xlsx';
  const cd = res.headers['content-disposition'];
  if (cd) {
    const m = /filename="([^"]+)"/.exec(cd) || /filename=([^;\s]+)/.exec(cd);
    if (m) {
      try {
        name = decodeURIComponent(m[1].trim());
      } catch {
        name = m[1].trim();
      }
    }
  }
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

