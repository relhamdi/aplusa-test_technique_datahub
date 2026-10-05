import { QueryClient } from "@tanstack/react-query";

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        // Refetching when the tab regains focus would make tables jump under the user's cursor ;
        // data is refreshed explicitly after each action instead.
        refetchOnWindowFocus: false,
      },
    },
  });
}
