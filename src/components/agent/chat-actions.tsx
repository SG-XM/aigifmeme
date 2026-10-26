import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { stopRun } from '@/lib/agent-runs';
import { apiDelete, apiPatch } from '@/lib/api-client';
import { m } from '@/paraglide/messages.js';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export interface ChatSummary {
  id: string;
  title: string;
}

/**
 * Rename/delete for a chat, with their confirmation dialogs. Shared by the
 * sidebar and the full chats page so both behave identically — including
 * aborting a turn that's still streaming into a chat being deleted.
 *
 * Render `dialogs` somewhere in the tree and call `openRename`/`openDelete`
 * from the row actions.
 */
export function useChatActions() {
  const queryClient = useQueryClient();
  const [renameTarget, setRenameTarget] = useState<ChatSummary | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ChatSummary | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['agent-chats'] });

  const renameMutation = useMutation({
    mutationFn: (vars: { id: string; title: string }) =>
      apiPatch(`/api/agent/chat/${encodeURIComponent(vars.id)}`, {
        title: vars.title,
      }),
    onSettled: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => {
      // Don't leave a turn streaming into a chat that no longer exists.
      stopRun(id);
      return apiDelete(`/api/agent/chat/${encodeURIComponent(id)}`);
    },
    onSettled: () => {
      setDeleteTarget(null);
      invalidate();
    },
  });

  function openRename(item: ChatSummary) {
    setRenameTarget(item);
    setRenameValue(item.title);
  }

  function commitRename() {
    if (!renameTarget) return;
    const next = renameValue.trim();
    if (next && next !== renameTarget.title) {
      renameMutation.mutate({ id: renameTarget.id, title: next });
    }
    setRenameTarget(null);
  }

  function commitDelete() {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id);
  }

  const dialogs: ReactNode = (
    <>
      <Dialog
        open={renameTarget !== null}
        onOpenChange={(o) => !o && setRenameTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m['agent.chats.rename_title']()}</DialogTitle>
            <DialogDescription>
              {m['agent.chats.rename_description']()}
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                commitRename();
              }
            }}
            placeholder={m['agent.chats.rename_placeholder']()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              {m['agent.chats.cancel']()}
            </Button>
            <Button onClick={commitRename} disabled={!renameValue.trim()}>
              {m['agent.chats.save']()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m['agent.chats.delete_title']()}</DialogTitle>
            <DialogDescription>
              {m['agent.chats.delete_description']({
                title: deleteTarget?.title ?? '',
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteMutation.isPending}
            >
              {m['agent.chats.cancel']()}
            </Button>
            <Button
              variant="destructive"
              onClick={commitDelete}
              disabled={deleteMutation.isPending}
            >
              {m['agent.chats.delete_confirm']()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  return { openRename, openDelete: setDeleteTarget, dialogs };
}
