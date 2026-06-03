import { Switch, Route, Router } from "wouter";
import { useState } from "react";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { EditProvider } from "@/components/EditContext";
import { AIProvider } from "@/components/AIContext";
import { AppShell } from "@/components/AppShell";
import { ScrollToTop } from "@/components/ScrollToTop";
import Home from "@/pages/Home";
import PeopleList from "@/pages/PeopleList";
import PersonDetail from "@/pages/PersonDetail";
import TreeView from "@/pages/TreeView";
import Gaps from "@/pages/Gaps";
import Insights from "@/pages/Insights";
import Places from "@/pages/Places";
import MapView from "@/pages/MapView";
import Timeline from "@/pages/Timeline";
import Surnames from "@/pages/Surnames";
import Relate from "@/pages/Relate";
import Research from "@/pages/Research";
import Roots from "@/pages/Roots";
import Finder from "@/pages/Finder";
import Anomalies from "@/pages/Anomalies";
import Duplicates from "@/pages/Duplicates";
import ExportPage from "@/pages/Export";
import Changes from "@/pages/Changes";
import NotFound from "@/pages/not-found";
import IntroScreen from "@/components/IntroScreen";

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/people" component={PeopleList} />
      <Route path="/person/:id" component={PersonDetail} />
      <Route path="/tree" component={TreeView} />
      <Route path="/gaps" component={Gaps} />
      <Route path="/insights" component={Insights} />
      <Route path="/places" component={Places} />
      <Route path="/map" component={MapView} />
      <Route path="/timeline" component={Timeline} />
      <Route path="/surnames" component={Surnames} />
      <Route path="/relate" component={Relate} />
      <Route path="/research" component={Research} />
      <Route path="/roots" component={Roots} />
      <Route path="/finder" component={Finder} />
      <Route path="/anomalies" component={Anomalies} />
      <Route path="/duplicates" component={Duplicates} />
      <Route path="/export" component={ExportPage} />
      <Route path="/changes" component={Changes} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  // Show cinematic intro only on first visit.
  // Uses localStorage key `cognatio_intro_seen` so returning users skip it.
  const [showIntro, setShowIntro] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("cognatio_intro_seen") !== "true";
  });

  const handleIntroComplete = () => {
    localStorage.setItem("cognatio_intro_seen", "true");
    setShowIntro(false);
  };

  if (showIntro) {
    // Render only the intro on first launch — main app content is hidden.
    return <IntroScreen onComplete={handleIntroComplete} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <EditProvider>
          <AIProvider>
            <TooltipProvider>
              <Toaster />
              <Router hook={useHashLocation}>
                <ScrollToTop />
                <AppShell>
                  <AppRouter />
                </AppShell>
              </Router>
            </TooltipProvider>
          </AIProvider>
        </EditProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
