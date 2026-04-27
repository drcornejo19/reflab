"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function login() {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert(error.message);
    } else {
      router.push("/dashboard");
    }
  }

  async function register() {
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      alert(error.message);
    } else {
      alert("Usuario creado. Revisá tu mail.");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-4 rounded-2xl bg-black/40 p-6">
        <h1 className="text-2xl font-black">Login RefLab</h1>

        <input
          placeholder="Email"
          className="w-full rounded-xl bg-black/40 p-3"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          placeholder="Password"
          type="password"
          className="w-full rounded-xl bg-black/40 p-3"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          onClick={login}
          className="w-full rounded-xl bg-[#6fc11f] p-3 font-black text-black"
        >
          Iniciar sesión
        </button>

        <button
          onClick={register}
          className="w-full rounded-xl bg-white/10 p-3"
        >
          Crear cuenta
        </button>
      </div>
    </div>
  );
}