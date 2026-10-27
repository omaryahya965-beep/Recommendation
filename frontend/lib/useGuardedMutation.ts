"use client";

import {
  useMutation,
  type DefaultError,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import { useCallback, useRef } from "react";

/**
 * useMutation that runs at most once at a time.
 *
 * `disabled={mutation.isPending}` only takes effect after React re-renders,
 * so a double click or a second Enter in the same frame submitted twice
 * (duplicate reports, duplicate follow-up snapshots). The ref flips
 * synchronously inside the first call, so the second is dropped; it is
 * released when the mutation settles, success or error.
 */
export function useGuardedMutation<TData = unknown, TError = DefaultError, TVariables = void, TContext = unknown>(
  options: UseMutationOptions<TData, TError, TVariables, TContext>
): UseMutationResult<TData, TError, TVariables, TContext> {
  const inFlight = useRef(false);
  const mutation = useMutation<TData, TError, TVariables, TContext>({
    ...options,
    onSettled: (...args) => {
      inFlight.current = false;
      return options.onSettled?.(...args);
    },
  });
  const { mutate: rawMutate, mutateAsync: rawMutateAsync } = mutation;

  const mutate = useCallback<typeof rawMutate>(
    (variables, callbacks) => {
      if (inFlight.current) return;
      inFlight.current = true;
      rawMutate(variables, callbacks);
    },
    [rawMutate]
  );

  const mutateAsync = useCallback<typeof rawMutateAsync>(
    (variables, callbacks) => {
      if (inFlight.current) return Promise.reject(new Error("A submission is already in progress."));
      inFlight.current = true;
      return rawMutateAsync(variables, callbacks);
    },
    [rawMutateAsync]
  );

  return { ...mutation, mutate, mutateAsync } as UseMutationResult<TData, TError, TVariables, TContext>;
}
