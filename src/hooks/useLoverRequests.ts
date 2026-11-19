import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { listLoverRequests } from '../services/loverRequests';

/** The caller's pending lover requests, both sent and received. */
export function useLoverRequests() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['lover-requests', user?.id],
    enabled: !!user,
    queryFn: listLoverRequests,
  });
}
