import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Database, Download, Lock, Clock, Code, CheckCircle, Play } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white">
      {/* Header/Nav */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                <Database className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold">Instant Admin</span>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/auth">
                <Button variant="outline" className="border-slate-600 text-slate-200 hover:bg-slate-800 hover:text-white">
                  Login
                </Button>
              </Link>
              <Link href="/auth">
                <Button className="bg-blue-500 hover:bg-blue-600 text-white">
                  Sign Up
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-r from-blue-600 to-blue-800 py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white mb-6">
              Your PostgreSQL databases,<br />
              simply managed
            </h1>
            <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
              Connect, browse, and manage your PostgreSQL databases with a modern, intuitive interface. 
              Perfect for developers, database administrators, and data analysts. No limits. Completely free.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link href="/auth">
                <Button size="lg" className="bg-white text-blue-600 hover:bg-blue-50 px-8 py-4 text-lg">
                  Get Started Free
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-white mb-4">
              Everything you need to manage PostgreSQL databases
            </h2>
            <p className="text-slate-400 text-lg max-w-3xl mx-auto">
              Powerful features designed for efficiency and ease of use
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <Database className="w-8 h-8 text-blue-400 mb-2" />
                <CardTitle className="text-white">Connect Any PostgreSQL Database</CardTitle>
              </CardHeader>
              <CardContent className="text-slate-300">
                <p>Connect to unlimited PostgreSQL databases with secure connection management and automatic schema detection.</p>
              </CardContent>
            </Card>

            {/* Feature 2 */}
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <Play className="w-8 h-8 text-green-400 mb-2" />
                <CardTitle className="text-white">Browse and Edit Tables</CardTitle>
              </CardHeader>
              <CardContent className="text-slate-300">
                <p>Intuitive table viewer with inline editing, filtering, and sorting capabilities.</p>
              </CardContent>
            </Card>

            {/* Feature 3 */}
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <Download className="w-8 h-8 text-purple-400 mb-2" />
                <CardTitle className="text-white">CSV Export</CardTitle>
              </CardHeader>
              <CardContent className="text-slate-300">
                <p>Export your data to CSV format with customizable column selection and filtering.</p>
              </CardContent>
            </Card>

            {/* Feature 4 */}
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <Code className="w-8 h-8 text-yellow-400 mb-2" />
                <CardTitle className="text-white">Saved Queries</CardTitle>
              </CardHeader>
              <CardContent className="text-slate-300">
                <p>Save and reuse frequently used SQL queries with parameter support.</p>
              </CardContent>
            </Card>

            {/* Feature 5 */}
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <Clock className="w-8 h-8 text-orange-400 mb-2" />
                <CardTitle className="text-white">Query History</CardTitle>
              </CardHeader>
              <CardContent className="text-slate-300">
                <p>Track all database operations and query executions with detailed logs.</p>
              </CardContent>
            </Card>

            {/* Feature 6 */}
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <Lock className="w-8 h-8 text-red-400 mb-2" />
                <CardTitle className="text-white">Read-only Mode</CardTitle>
              </CardHeader>
              <CardContent className="text-slate-300">
                <p>Protect your production data with read-only connections that prevent accidental modifications.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-24 bg-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-white mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-slate-400 text-lg mb-8">
              No credit cards required. Just powerful database management.
            </p>
          </div>
          
          <Card className="bg-slate-900 border-slate-700 max-w-2xl mx-auto">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl text-white">Free Forever</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <div className="space-y-4">
                <div className="flex justify-center mb-6">
                  <CheckCircle className="w-12 h-12 text-green-400" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold text-white">All Features Included</h3>
                  <ul className="text-slate-300 space-y-2">
                    <li>Unlimited database connections</li>
                    <li>Unlimited tables and queries</li>
                    <li>CSV export functionality</li>
                    <li>Query history tracking</li>
                    <li>Read-only mode protection</li>
                  </ul>
                </div>
                <div className="pt-6">
                  <Link href="/auth">
                    <Button size="lg" className="bg-blue-500 hover:bg-blue-600 text-white px-8">
                      Get Started
                    </Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-900 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center text-slate-400">
            <p>&copy; 2024 Instant Admin. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
