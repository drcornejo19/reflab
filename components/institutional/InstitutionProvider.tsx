"use client";

import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import type {
  InstitutionAccessSnapshot,
  InstitutionContext,
} from "@/lib/institutional/types";

type InstitutionProviderValue = {
  snapshot: InstitutionAccessSnapshot | null;
  activeContext: InstitutionContext | null;
  loading: boolean;
  selecting: boolean;
  error: string | null;
  selectInstitution: (institutionId: string) => Promise<boolean>;
  refreshInstitutions: () => Promise<InstitutionAccessSnapshot | null>;
};

const InstitutionContextState = createContext<InstitutionProviderValue | null>(
  null
);

const storageKey = "reflab_active_institution";

export function InstitutionProvider({ children }: { children: ReactNode }) {
  const { userId, isLoaded } = useAuth();
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<InstitutionAccessSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadSnapshot() {
    if (!userId) {
      setSnapshot(null);
      setError(null);
      setLoading(false);
      return null;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/institution/context", {
        cache: "no-store",
      });
      const data = (await response.json()) as InstitutionAccessSnapshot & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "No se pudo cargar la institucion.");
      }

      setSnapshot(data);
      setError(null);
      if (data.activeInstitutionId) {
        window.localStorage.setItem(storageKey, data.activeInstitutionId);
      }
      return data;
    } catch (loadError) {
      setSnapshot(null);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudo cargar la institucion."
      );
      return null;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isLoaded) return;
    void loadSnapshot();
    // The user id is the only identity input for this initial load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, userId]);

  async function selectInstitution(institutionId: string) {
    if (!snapshot?.contexts.some((item) => item.institution.id === institutionId)) {
      setError("No tenes acceso a la institucion seleccionada.");
      return false;
    }

    setSelecting(true);
    try {
      const response = await fetch("/api/institution/context", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ institutionId }),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error || "No se pudo cambiar de institucion.");
      }

      setSnapshot((current) =>
        current ? { ...current, activeInstitutionId: institutionId } : current
      );
      window.localStorage.setItem(storageKey, institutionId);
      setError(null);
      startTransition(() => router.refresh());
      return true;
    } catch (selectionError) {
      setError(
        selectionError instanceof Error
          ? selectionError.message
          : "No se pudo cambiar de institucion."
      );
      return false;
    } finally {
      setSelecting(false);
    }
  }

  const activeContext =
    snapshot?.contexts.find(
      (context) => context.institution.id === snapshot.activeInstitutionId
    ) ??
    snapshot?.contexts[0] ??
    null;

  return (
    <InstitutionContextState.Provider
      value={{
        snapshot,
        activeContext,
        loading,
        selecting,
        error,
        selectInstitution,
        refreshInstitutions: loadSnapshot,
      }}
    >
      {children}
    </InstitutionContextState.Provider>
  );
}

export function useInstitution() {
  const value = useContext(InstitutionContextState);
  if (!value) {
    throw new Error("useInstitution must be used inside InstitutionProvider.");
  }
  return value;
}
