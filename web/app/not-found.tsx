import { NotFoundCopy } from "@/components/shared/JobError";

export default function NotFound() {
  return (
    <>
      <h1 style={{ marginBottom: 24 }}>Page not found</h1>
      <NotFoundCopy />
    </>
  );
}
