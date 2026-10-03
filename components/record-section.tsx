"use client";

import { useId, useState, type FormEvent } from "react";
import { Eye, EyeOff, IdCard, LoaderCircle, ShieldCheck } from "lucide-react";

import { FieldList, SectionHeading, type Field } from "@/components/field-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isMasked } from "@/lib/privacy";
import { CryptoUnavailableError, openSecret, type SecretValues } from "@/lib/secret";
import type { PrivateField } from "@/lib/site";
import type { SecretBlob } from "@/lib/types";

export type RecordRow = { label: string; value: string | null; field?: PrivateField };

// "Nhớ mã trên máy này": tiện cho HLV quét nhiều thẻ. Chỉ lưu khi người dùng tự tích chọn.
const STORAGE_KEY = "qrprofile:view-code";
const storage = {
  get: () => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  },
  set: (code: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch {
      // Trình duyệt chặn lưu (chế độ riêng tư): bỏ qua, lần sau nhập lại.
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // như trên
    }
  },
};

type Status = "idle" | "busy" | "wrong" | "unsupported";

/** "Hồ sơ môn sinh" + con mắt: nhập mã xem để giải mã và hiện đầy đủ các trường đang bị che. */
export function RecordSection({
  rows,
  secret,
  slug,
}: {
  rows: RecordRow[];
  secret: SecretBlob | null;
  slug: string;
}) {
  const inputId = useId();
  const [values, setValues] = useState<SecretValues | null>(null);
  const [visible, setVisible] = useState(false);
  const [asking, setAsking] = useState(false);
  const [code, setCode] = useState("");
  const [remember, setRemember] = useState(false);
  const [remembered, setRemembered] = useState(false);
  const [status, setStatus] = useState<Status>("idle");

  async function unlock(candidate: string, fromStorage: boolean): Promise<boolean> {
    if (!secret) return false;
    setStatus("busy");
    try {
      setValues(await openSecret(secret, candidate, slug));
      setVisible(true);
      setAsking(false);
      setCode("");
      setStatus("idle");
      if (remember && !fromStorage) storage.set(candidate);
      setRemembered(fromStorage || remember);
      return true;
    } catch (e) {
      setStatus(e instanceof CryptoUnavailableError ? "unsupported" : "wrong");
      return false;
    }
  }

  async function toggle() {
    if (visible) return setVisible(false);
    if (values) return setVisible(true);
    if (asking) return setAsking(false);
    const stored = storage.get();
    if (stored) {
      if (await unlock(stored, true)) return;
      storage.clear(); // Mã đã lưu không còn đúng (đã đổi mã): hỏi lại.
    }
    setAsking(true);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (code) void unlock(code, false);
  }

  const fields: Field[] = rows.map(({ label, value, field }) => [
    label,
    visible && field && values?.[field] ? values[field] : value,
  ]);
  const anyMasked = rows.some(({ value }) => isMasked(value));

  return (
    <section className="space-y-3 px-4 py-5 sm:px-5">
      <div className="flex min-h-8 items-center justify-between gap-3">
        <SectionHeading icon={IdCard}>Hồ sơ môn sinh</SectionHeading>
        {secret && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={toggle}
            disabled={status === "busy"}
            aria-pressed={visible}
            aria-expanded={asking}
            aria-controls={asking ? `${inputId}-form` : undefined}
          >
            {status === "busy" ? (
              <LoaderCircle className="animate-spin" />
            ) : visible ? (
              <EyeOff />
            ) : (
              <Eye />
            )}
            {visible ? "Ẩn" : "Xem đầy đủ"}
          </Button>
        )}
      </div>

      {asking && (
        <form
          id={`${inputId}-form`}
          onSubmit={submit}
          className="bg-muted/60 space-y-2.5 rounded-lg border p-3"
        >
          <label htmlFor={inputId} className="block text-sm font-medium">
            Nhập mã xem
          </label>
          <div className="flex gap-2">
            <Input
              id={inputId}
              type="password"
              autoComplete="off"
              autoFocus
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (status === "wrong") setStatus("idle");
              }}
              aria-invalid={status === "wrong" || undefined}
              aria-describedby={`${inputId}-hint`}
              className="bg-background"
            />
            <Button type="submit" disabled={!code || status === "busy"} className="shrink-0">
              {status === "busy" && <LoaderCircle className="animate-spin" />}
              Mở
            </Button>
          </div>
          <label className="text-muted-foreground flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="accent-primary size-4"
            />
            Nhớ mã trên máy này
          </label>
          <p id={`${inputId}-hint`} className="text-muted-foreground text-xs">
            Chỉ ban quản lý và huấn luyện viên có mã xem.
          </p>
          {status === "wrong" && (
            <p role="alert" className="text-destructive text-xs font-medium">
              Mã xem không đúng.
            </p>
          )}
          {status === "unsupported" && (
            <p role="alert" className="text-destructive text-xs font-medium">
              Trình duyệt không mở được. Hãy mở trang bằng địa chỉ https://.
            </p>
          )}
        </form>
      )}

      <FieldList fields={fields} />

      {visible ? (
        <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
          <Eye aria-hidden className="mt-px size-3.5 shrink-0" />
          <span>
            Đang hiện thông tin đầy đủ. Bấm &quot;Ẩn&quot; để che lại.
            {remembered && (
              <>
                {" "}
                <button
                  type="button"
                  onClick={() => {
                    storage.clear();
                    setRemembered(false);
                  }}
                  className="text-primary underline underline-offset-2"
                >
                  Quên mã trên máy này
                </button>
              </>
            )}
          </span>
        </p>
      ) : (
        anyMasked && (
          <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
            <ShieldCheck aria-hidden className="mt-px size-3.5 shrink-0" />
            Một số thông tin cá nhân được che bớt để bảo vệ môn sinh.
          </p>
        )
      )}
    </section>
  );
}
