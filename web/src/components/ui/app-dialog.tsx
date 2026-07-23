import type { ComponentProps, HTMLAttributes, ReactNode } from 'react'
import { CloseIcon } from '@/components/icons'
import { cn } from '@/lib/utils'
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogTitle,
    DialogTrigger,
} from './dialog'

export const AppDialog = Dialog
export const AppDialogTrigger = DialogTrigger

type AppDialogContentProps = ComponentProps<typeof DialogContent> & {
    dismissible?: boolean
}

export function AppDialogContent(props: AppDialogContentProps) {
    const {
        className,
        dismissible = true,
        onEscapeKeyDown,
        onInteractOutside,
        onPointerDownOutside,
        showClose: _showClose,
        ...rest
    } = props
    return (
        <DialogContent
            showClose={false}
            data-app-dialog-content=""
            onEscapeKeyDown={(event) => {
                onEscapeKeyDown?.(event)
                if (!dismissible) event.preventDefault()
            }}
            onInteractOutside={(event) => {
                onInteractOutside?.(event)
                if (!dismissible) event.preventDefault()
            }}
            onPointerDownOutside={(event) => {
                onPointerDownOutside?.(event)
                if (!dismissible) event.preventDefault()
            }}
            className={cn(
                'flex max-h-[calc(100vh-24px)] flex-col gap-0 overflow-hidden border-[var(--app-border)] bg-[var(--app-bg)] p-0',
                className
            )}
            {...rest}
        />
    )
}

export function AppDialogHeader(props: {
    icon?: ReactNode
    title: ReactNode
    subtitle?: ReactNode
    meta?: ReactNode
    actions?: ReactNode
    closeLabel?: string
    closeDisabled?: boolean
    className?: string
}) {
    return (
        <header
            className={cn(
                'flex min-h-[50px] shrink-0 items-center gap-3 border-b border-[var(--app-border)] bg-[var(--app-subtle-bg)] pl-3 pr-1.5',
                props.className
            )}
        >
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
                {props.icon ? <div className="shrink-0">{props.icon}</div> : null}
                <div className="min-w-0">
                    <DialogTitle className="truncate text-sm font-semibold text-[var(--app-fg)]">
                        {props.title}
                    </DialogTitle>
                    {props.subtitle ? (
                        <DialogDescription className="mt-0.5 truncate text-[11px] text-[var(--app-hint)]">
                            {props.subtitle}
                        </DialogDescription>
                    ) : (
                        <DialogDescription className="sr-only">
                            {typeof props.title === 'string' ? `${props.title} dialog` : 'Dialog'}
                        </DialogDescription>
                    )}
                </div>
            </div>
            {props.meta ? <div className="flex shrink-0 items-center gap-2">{props.meta}</div> : null}
            {props.actions ? <div className="flex shrink-0 items-center gap-1">{props.actions}</div> : null}
            <AppDialogClose label={props.closeLabel} disabled={props.closeDisabled} />
        </header>
    )
}

export function AppDialogClose({
    label = 'Close',
    disabled = false,
}: {
    label?: string
    disabled?: boolean
}) {
    return (
        <DialogClose asChild>
            <button
                type="button"
                aria-label={label}
                disabled={disabled}
                className="grid h-[36px] w-[36px] shrink-0 place-items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-button)] disabled:cursor-not-allowed disabled:opacity-50"
            >
                <span className="grid h-[28px] w-[28px] place-items-center rounded-lg border border-[var(--app-border)] bg-transparent text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]">
                    <CloseIcon className="h-[13px] w-[13px]" />
                </span>
            </button>
        </DialogClose>
    )
}

export function AppDialogBody(props: HTMLAttributes<HTMLDivElement>) {
    return <div {...props} className={cn('min-h-0 flex-1', props.className)} />
}

export function AppDialogFooter(props: HTMLAttributes<HTMLDivElement>) {
    return (
        <footer
            data-app-dialog-footer=""
            {...props}
            className={cn(
                'flex shrink-0 items-center justify-end gap-2 border-t border-[var(--app-border)] bg-[var(--app-subtle-bg)] px-3 py-2.5',
                props.className
            )}
        />
    )
}
