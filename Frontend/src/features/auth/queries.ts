import { useMutation, useQueryClient } from '@tanstack/react-query'
import { SESSION_QUERY_KEY } from '@/hooks/use-auth'
import { rememberWorkspace, workspaceKeys } from '@/hooks/use-workspace'
import { workspaceService } from '@/services/workspace.service'
import type { CreateWorkspaceRequest } from '@/types'

/** Creates a workspace. The session is refetched so its membership list includes it. */
export function useCreateWorkspace() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateWorkspaceRequest) => workspaceService.create(payload),
    onSuccess: async (workspace) => {
      queryClient.setQueryData(workspaceKeys.detail(workspace.id), workspace)
      rememberWorkspace(workspace.id)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: workspaceKeys.all, exact: true }),
        queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY }),
      ])
    },
  })
}
