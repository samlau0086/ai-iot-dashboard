import React, { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Cpu, Lock, Mail, User, Factory } from 'lucide-react';
import { useAppStore } from '../lib/store';

type AuthMode = 'login' | 'register';

export function Auth({ mode }: { mode: AuthMode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, login, registerUser } = useAppStore();
  const [message, setMessage] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    siteId: 'factory-a',
  });

  useEffect(() => {
    setMessage('');
  }, [mode]);

  if (currentUser) {
    const target = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/';
    return <Navigate to={target} replace />;
  }

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (mode === 'login') {
      const result = login(formData.email, formData.password);
      setMessage(result.message);
      return;
    }

    const result = registerUser(formData);
    setMessage(result.message);
    if (result.ok) {
      setFormData({ name: '', email: '', password: '', siteId: 'factory-a' });
      window.setTimeout(() => navigate('/login'), 900);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      <div className="hidden lg:flex lg:w-[42%] flex-col justify-between border-r border-slate-800 bg-slate-900 px-10 py-10">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/15 text-orange-400 ring-1 ring-orange-400/30">
            <Cpu className="h-6 w-6" />
          </div>
          <div>
            <p className="text-lg font-semibold text-white">AI IoT Dashboard</p>
            <p className="text-xs uppercase tracking-wider text-slate-500">Industrial Monitoring Platform</p>
          </div>
        </div>

        <div className="max-w-md">
          <h1 className="text-3xl font-semibold tracking-tight text-white">Secure access for industrial operations.</h1>
          <p className="mt-4 text-sm leading-6 text-slate-400">
            New users must be reviewed in Settings before they can access device data, dashboards, workflows, and reports.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 text-xs text-slate-400">
          {['Approved users only', 'Role based access', 'Site scoped accounts'].map((item) => (
            <div key={item} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              {item}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-3">
              <Cpu className="h-8 w-8 text-orange-500" />
              <span className="text-lg font-semibold">AI IoT Dashboard</span>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-xl">
            <div>
              <h2 className="text-xl font-semibold text-white">{mode === 'login' ? 'Sign in' : 'Create account'}</h2>
              <p className="mt-2 text-sm text-slate-400">
                {mode === 'login'
                  ? 'Use an approved account to enter the operations console.'
                  : 'Submit your account request. An administrator will approve your access and role.'}
              </p>
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              {mode === 'register' && (
                <div>
                  <label className="mb-1 flex items-center gap-2 text-sm font-medium text-slate-300">
                    <User className="h-4 w-4" />
                    Name
                  </label>
                  <input
                    required
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    className="block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-orange-500"
                    placeholder="Operations Engineer"
                  />
                </div>
              )}

              <div>
                <label className="mb-1 flex items-center gap-2 text-sm font-medium text-slate-300">
                  <Mail className="h-4 w-4" />
                  Email
                </label>
                <input
                  required
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-orange-500"
                  placeholder="admin@factory.com"
                />
              </div>

              <div>
                <label className="mb-1 flex items-center gap-2 text-sm font-medium text-slate-300">
                  <Lock className="h-4 w-4" />
                  Password
                </label>
                <input
                  required
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  className="block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-orange-500"
                  placeholder="password123"
                />
              </div>

              {mode === 'register' && (
                <div>
                  <label className="mb-1 flex items-center gap-2 text-sm font-medium text-slate-300">
                    <Factory className="h-4 w-4" />
                    Site / Tag scope
                  </label>
                  <input
                    name="siteId"
                    value={formData.siteId}
                    onChange={handleChange}
                    className="block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-orange-500"
                    placeholder="factory-a"
                  />
                </div>
              )}

              {message && (
                <div className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300">
                  {message}
                </div>
              )}

              <button
                type="submit"
                className="w-full rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-500"
              >
                {mode === 'login' ? 'Sign in' : 'Submit for approval'}
              </button>
            </form>

            <p className="mt-5 text-center text-sm text-slate-400">
              {mode === 'login' ? (
                <>
                  Need access? <Link className="font-medium text-orange-400 hover:text-orange-300" to="/register">Register</Link>
                </>
              ) : (
                <>
                  Already approved? <Link className="font-medium text-orange-400 hover:text-orange-300" to="/login">Sign in</Link>
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
