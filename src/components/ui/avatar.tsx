import type * as React from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";

function Avatar({ className, ...props }: React.ComponentProps<"span">) {
	return (
		<span
			data-slot="avatar"
			className={cn(
				"relative flex size-8 shrink-0 overflow-hidden rounded-full",
				className,
			)}
			{...props}
		/>
	);
}

function AvatarImage({
	className,
	alt = "",
	src,
	...props
}: React.ComponentProps<"img">) {
	const [hasError, setHasError] = useState(false);

	if (!src || hasError) {
		return null;
	}

	return (
		<img
			data-slot="avatar-image"
			src={src}
			alt={alt}
			className={cn("aspect-square size-full object-cover", className)}
			onError={() => setHasError(true)}
			{...props}
		/>
	);
}

function AvatarFallback({ className, ...props }: React.ComponentProps<"span">) {
	return (
		<span
			data-slot="avatar-fallback"
			className={cn(
				"flex size-full items-center justify-center rounded-full bg-muted text-muted-foreground",
				className,
			)}
			{...props}
		/>
	);
}

export { Avatar, AvatarFallback, AvatarImage };
