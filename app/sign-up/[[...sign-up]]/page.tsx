import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050910]">
      <SignUp
        fallbackRedirectUrl="/discipline"
        forceRedirectUrl="/discipline"
        signInUrl="/sign-in"
      />
    </main>
  );
}
