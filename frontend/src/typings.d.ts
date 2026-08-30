declare module '*.less' {
  const styles: Record<string, string>;
  export default styles;
}

declare module '@umijs/max' {
  export function defineConfig(config: Record<string, unknown>): Record<string, unknown>;
  export const history: {
    push(path: string): void;
    replace(path: string): void;
  };
  export function useLocation(): { pathname: string; search?: string };
  export function useParams<T extends Record<string, string | undefined>>(): T;
  export const Outlet: React.ComponentType;
}
