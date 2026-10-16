import Login from "./login-view";
export const dynamic = "force-dynamic";
export default function LoginPage() {
  return (
    <Login
      local={
        process.env.AUTH_MODE === "local" &&
        (process.env.NODE_ENV !== "production" ||
          process.env.ALLOW_LOCAL_PREVIEW === "true")
      }
      sso={
        process.env.AUTH_MODE === "oidc" &&
        !!process.env.OIDC_ISSUER &&
        !!process.env.OIDC_CLIENT_ID
      }
    />
  );
}
