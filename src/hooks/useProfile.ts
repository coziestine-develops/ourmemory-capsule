import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { errorMessage } from '../lib/format';
import { getAvatarUrl, getProfile, removeAvatar, uploadAvatar } from '../services/profile';

export function useProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['profile', user?.id],
    enabled: !!user,
    queryFn: () => getProfile(user!.id),
  });
}

export function useAvatarUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['avatar-url', path],
    enabled: !!path,
    queryFn: () => getAvatarUrl(path!),
    staleTime: 50 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
}

export function useAvatarActions() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['profile'] });
    await queryClient.invalidateQueries({ queryKey: ['member-list'] });
  };

  const upload = useMutation({
    mutationFn: (file: File) => uploadAvatar(user!.id, file, profile?.avatar_path ?? null),
    onSuccess: async () => {
      await refresh();
      toast('Your profile photo is updated.');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const remove = useMutation({
    mutationFn: () => removeAvatar(user!.id, profile?.avatar_path ?? null),
    onSuccess: async () => {
      await refresh();
      toast('Profile photo removed.');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  return { profile, upload, remove, busy: upload.isPending || remove.isPending };
}
