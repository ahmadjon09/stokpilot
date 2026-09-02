import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Sheet (modal) ni alohida route sifatida ochadi:
 * hozirgi sahifa location.state.background ga yoziladi →
 * Back tugmasi sheet ni yopadi, sahifa almashmaydi.
 */
export function useOpenSheet(): (path: string) => void {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback(
    (path: string) => {
      navigate(path, {
        state: {
          background: { pathname: location.pathname, search: location.search },
        },
      });
    },
    [navigate, location.pathname, location.search]
  );
}
