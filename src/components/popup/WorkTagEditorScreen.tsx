import { useEffect, useState } from "react";
import type { WorkTag } from "../../lib/storage";
import {
  getWorkTags,
  setWorkTags,
  getTodos,
  setTodos,
  flush,
} from "../../lib/storage";
import { removeTagRefs } from "../../lib/todos";
import { TagListEditor } from "./TagListEditor";

type Props = { onClose: () => void };

/**
 * 작업 태그 편집 화면 (설계 §10).
 *
 * - 마운트 시 1회 store read → 편집기에 전달.
 * - 저장 (U-4 일괄): setWorkTags(save:false) + setTodos(removeTagRefs, save:false) + flush()
 *   → 디스크 I/O 1회로 묶음 (BR-5).
 * - maxItems=5 (BR-4/AC-16).
 */
export function WorkTagEditorScreen({ onClose }: Props) {
  const [items, setItems] = useState<WorkTag[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const w = await getWorkTags();
        if (!cancelled) setItems(w);
      } catch (err) {
        console.error("[mohashim] getWorkTags failed", err);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async (next: WorkTag[], deletedIds: string[]) => {
    try {
      await setWorkTags(next, { save: false });
      if (deletedIds.length > 0) {
        const todos = await getTodos();
        const cleaned = removeTagRefs(todos, deletedIds, "work");
        await setTodos(cleaned, { save: false });
      }
      await flush();
    } catch (err) {
      console.error("[mohashim] work tag save failed", err);
      throw err;
    }
  };

  if (!loaded) return null;

  return (
    <TagListEditor
      title="작업 태그 편집"
      items={items}
      kind="work"
      maxItems={5}
      onSave={handleSave}
      onClose={onClose}
    />
  );
}
