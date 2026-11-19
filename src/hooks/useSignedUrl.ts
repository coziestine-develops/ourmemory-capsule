import { useQuery } from '@tanstack/react-query';
import { getSignedUrl } from '../services/memories';

export function useSignedUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['signed-url', path],
    enabled: !!path,
    queryFn: () => getSignedUrl(path!),
    staleTime: 50 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
  });
}
