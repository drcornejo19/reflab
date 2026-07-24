"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@clerk/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAuthenticatedSupabaseClient } from "@/lib/supabaseAuthenticated";

const SupabaseContext = createContext<SupabaseClient | null>(null);

export function SupabaseProvider({ children }: { children: ReactNode }) {
  const { getToken } = useAuth();
  const [client] = useState(() =>
    createAuthenticatedSupabaseClient(() => {
      if (typeof window === "undefined") {
        return Promise.resolve(null);
      }

      return getToken();
    })
  );

  return (
    <SupabaseContext.Provider value={client}>
      {children}
    </SupabaseContext.Provider>
  );
}

export function useSupabase() {
  const client = useContext(SupabaseContext);

  if (!client) {
    throw new Error("useSupabase debe usarse dentro de SupabaseProvider.");
  }

  return client;
}
