"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/http";

export const useDeployment = () => useQuery({ queryKey: ["config"], queryFn: api.config, staleTime: Infinity, retry: 3 });
