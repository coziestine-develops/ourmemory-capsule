import { lazy, Suspense, useEffect } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { LoginPage, SignUpPage, ForgotPasswordPage, ResetPasswordPage } from './pages/auth/AuthPages';
import { OnboardingPage } from './pages/relationship/RelationshipPages';
import AppLayout from './components/layout/AppLayout';
import { RequireAuth, RequireRelationship } from './components/common/ProtectedRoute';
import { pageLoaders, preloadAllRoutes } from './lib/routes';

// Each page is its own chunk, so the first paint is small. They are all downloaded quietly once the app is idle.
const DashboardPage = lazy(pageLoaders.dashboard);
const MemoriesPage = lazy(pageLoaders.memories);
const MemoryEditorPage = lazy(pageLoaders.memoryEditor);
const MemoryDetailPage = lazy(pageLoaders.memoryDetail);
const AlbumsPage = lazy(pageLoaders.albums);
const AlbumDetailPage = lazy(pageLoaders.albumDetail);
const CalendarPage = lazy(pageLoaders.calendar);
const TimelinePage = lazy(pageLoaders.timeline);
const LettersPage = lazy(pageLoaders.letters);
const LetterEditorPage = lazy(pageLoaders.letterEditor);
const LetterDetailPage = lazy(pageLoaders.letterDetail);
const CapsulesPage = lazy(pageLoaders.capsules);
const CapsuleNewPage = lazy(pageLoaders.capsuleNew);
const CapsuleDetailPage = lazy(pageLoaders.capsuleDetail);
const BucketListPage = lazy(pageLoaders.bucketList);
const MessagesPage = lazy(pageLoaders.messages);
const RelationshipPage = lazy(pageLoaders.relationship);
const SettingsPage = lazy(pageLoaders.settings);

export default function App() {
  useEffect(() => preloadAllRoutes(), []);

  return (
    <Suspense fallback={<div className="hero-gradient min-h-dvh" aria-hidden="true" />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        <Route element={<RequireAuth />}>
          <Route path="/onboarding" element={<OnboardingPage />} />

          <Route element={<RequireRelationship />}>
            <Route element={<AppLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="/memories" element={<MemoriesPage />} />
              <Route path="/memories/new" element={<MemoryEditorPage />} />
              <Route path="/memories/:id" element={<MemoryDetailPage />} />
              <Route path="/memories/:id/edit" element={<MemoryEditorPage />} />
              <Route path="/albums" element={<AlbumsPage />} />
              <Route path="/albums/:id" element={<AlbumDetailPage />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/timeline" element={<TimelinePage />} />
              <Route path="/letters" element={<LettersPage />} />
              <Route path="/letters/new" element={<LetterEditorPage />} />
              <Route path="/letters/:id" element={<LetterDetailPage />} />
              <Route path="/letters/:id/edit" element={<LetterEditorPage />} />
              <Route path="/capsules" element={<CapsulesPage />} />
              <Route path="/capsules/new" element={<CapsuleNewPage />} />
              <Route path="/capsules/:id" element={<CapsuleDetailPage />} />
              <Route path="/bucket-list" element={<BucketListPage />} />
              <Route path="/messages" element={<MessagesPage />} />
              <Route path="/relationship" element={<RelationshipPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Route>
        </Route>

        <Route
          path="*"
          element={
            <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
              <p className="font-heading text-3xl font-semibold">This page isn't in the scrapbook.</p>
              <Link className="btn-primary" to="/">Back to home</Link>
            </div>
          }
        />
      </Routes>
    </Suspense>
  );
}
