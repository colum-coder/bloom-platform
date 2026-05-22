import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center max-w-sm">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ backgroundColor: "#FF6A4215" }}
        >
          <svg
            className="w-8 h-8"
            style={{ color: "#FF6A42" }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01M5.07 19H19a2 2 0 001.75-2.97L13.75 4a2 2 0 00-3.5 0L3.25 16.03A2 2 0 005.07 19z"
            />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">
          Access denied
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          You do not have permission to view this page. If you believe this is
          an error, contact your Bloom administrator.
        </p>
        <Link
          href="/login"
          className="inline-block text-sm font-medium underline"
          style={{ color: "#2B307E" }}
        >
          Back to login
        </Link>
      </div>
    </div>
  );
}
