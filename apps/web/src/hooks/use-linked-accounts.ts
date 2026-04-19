import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import type { LinkedAccount } from "@/lib/google-integrations";

export const useLinkedAccounts = (
	sessionUser: { email?: string | null } | null | undefined,
) => {
	const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
	const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);

	const loadAccounts = useCallback(async () => {
		if (!sessionUser) {
			setAccounts([]);
			return;
		}

		setIsLoadingAccounts(true);

		try {
			const result = await authClient.$fetch("/list-accounts", {
				method: "GET",
				throw: true,
			});
			setAccounts(Array.isArray(result) ? (result as LinkedAccount[]) : []);
		} catch (error) {
			console.error("Failed to load linked accounts", error);
			toast.error("Failed to load linked Google accounts");
		} finally {
			setIsLoadingAccounts(false);
		}
	}, [sessionUser]);

	useEffect(() => {
		void loadAccounts();
	}, [loadAccounts]);

	useEffect(() => {
		const handleFocus = () => {
			void loadAccounts();
		};

		window.addEventListener("focus", handleFocus);
		return () => window.removeEventListener("focus", handleFocus);
	}, [loadAccounts]);

	return {
		accounts,
		isLoadingAccounts,
		loadAccounts,
	};
};
