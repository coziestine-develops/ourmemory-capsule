export function SetupNotice() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-6">
      <div className="max-w-lg rounded-3xl bg-white p-8 shadow-polaroid">
        <p className="font-heading text-3xl font-semibold">Memory Capsule</p>
        <p className="handwritten mt-1 text-xl text-mocha">Almost ready.</p>
        <h1 className="mt-6 font-heading text-xl font-semibold">Add your Supabase settings</h1>
        <p className="mt-2 text-sm text-mocha">
          The app can't connect to the database yet. Create a file named <code>.env.local</code> in the project
          folder, next to <code>package.json</code>, with these two lines:
        </p>
        <pre className="mt-4 overflow-x-auto rounded-xl bg-ivory p-4 text-sm">
{`VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key`}
        </pre>
        <p className="mt-4 text-sm text-mocha">
          Copy both values from Supabase under Project Settings, then API. Stop the dev server with Ctrl+C,
          run <code>npm run dev</code> again, and refresh the page.
        </p>
      </div>
    </div>
  );
}
