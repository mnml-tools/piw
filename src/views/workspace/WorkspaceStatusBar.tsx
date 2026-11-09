import { Separator, StatusBar } from '@mnml-tools/ui';
import { useInboxCount, useSpaces } from '@/lib/hooks/data';
import { useWorkspace } from '@/state/workspace';
import { common } from '@/strings/common';
import { workspaceStrings as t } from '@/strings/workspace';

/**
 * The kit's `StatusBar` at the window's foot, as in Zap: the app and the current space on the
 * left ("PIW / Work"), the Inbox count and where the data lives on the right.
 */
export function WorkspaceStatusBar() {
  const ws = useWorkspace();
  const spaces = useSpaces().data ?? [];
  const inboxCount = useInboxCount(ws.spaceId).data ?? 0;
  const space = spaces.find((item) => item.id === ws.spaceId)?.name ?? common.spaces.all;
  return (
    <StatusBar
      start={`${t.topBar.footerApp} / ${space}`}
      end={
        <>
          {t.topBar.footerInbox(inboxCount)}
          <Separator />
          {t.topBar.footerStorage}
        </>
      }
    />
  );
}
