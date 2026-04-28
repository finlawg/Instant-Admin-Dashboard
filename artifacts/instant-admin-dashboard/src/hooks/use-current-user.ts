import { useQuery } from "@tanstack/react-query";
import { getGetCurrentUserQueryKey, type AuthUser } from "@workspace/api-client-react";

export function useCurrentUser() {
  return useQuery<AuthUser | null>({
    queryKey: getGetCurrentUserQueryKey(),
    queryFn: async () => {
      const response = await fetch(`${import.meta.env.BASE_URL}api/auth/me`, {
        credentials: "same-origin",
      });

      if (response.status === 401) {
        return null;
      }

      if (!response.ok) {
        throw new Error("Unable to check the current session");
      }

      return response.json();
    },
    retry: false,
  });
}