export default function Flash({ notice, error }: { notice?: string; error?: string }) {
  return (
    <>
      {notice && <p role="status" className="rounded-theme bg-secondary p-3 text-success">{notice}</p>}
      {error && <p role="alert" className="rounded-theme bg-danger/10 p-3 text-danger">{error}</p>}
    </>
  );
}
