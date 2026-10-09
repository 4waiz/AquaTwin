import Link from "next/link";
import { AquaTwinMark } from "@/components/icons";

export default function NotFound() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-5 p-8 text-center">
      <AquaTwinMark size={72} glow />
      <div>
        <div className="label">404 · outside the envelope</div>
        <h1 className="mt-2 text-[24px] font-semibold tracking-tight text-fg">This view does not exist.</h1>
        <p className="mt-1.5 max-w-md text-[13.5px] text-fg-muted">Like AquaTwin outside its validated envelope, we would rather say so than guess.</p>
      </div>
      <Link href="/" className="btn-brand inline-flex h-9 items-center rounded-md px-4 text-[13px] font-medium text-white">
        Back to the plant
      </Link>
    </div>
  );
}
