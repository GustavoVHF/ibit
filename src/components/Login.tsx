import React, { useState, useEffect } from 'react';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../utils/errorHandlers';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';
import logoIbit from '../media/ibitlogo.svg';
import { useI18n } from '../i18n/LanguageContext';

export default function Login() {
  const [error, setError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useI18n();

  useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  const handleGoogleSignIn = async () => {
    try {
      setError('');
      setIsLoggingIn(true);
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        try {
          await setDoc(userRef, {
            uid: user.uid,
            name: user.displayName || 'Piloto',
            email: user.email,
            photoURL: user.photoURL || '',
            role: 'user',
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}`);
        }
      }

      navigate('/dashboard');
    } catch (err: any) {
      console.error(err);
      setError(t.auth.googleError);
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-gray-900 flex flex-col justify-center items-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-sm bg-white border border-gray-200 p-8 shadow-sm rounded-xl"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="w-48 mb-4">
            <img src={logoIbit} alt={t.common.logoAlt} className="w-full h-full object-contain" />
          </div>
          <h1 className="text-[10px] font-black tracking-[0.2em] font-sans text-gray-400 text-center leading-tight whitespace-nowrap">
            <span className="text-[#ff7f00]">BY CARNELIAN ESCUDERIA</span>
          </h1>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 p-3 mb-6 text-xs font-bold uppercase tracking-wider text-center rounded-lg">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <button
            onClick={handleGoogleSignIn}
            disabled={isLoggingIn}
            className="w-full flex items-center justify-center gap-3 bg-white text-gray-700 font-bold py-3 px-4 hover:bg-gray-50 transition-colors uppercase tracking-widest text-xs border border-gray-200 rounded-lg shadow-sm disabled:opacity-50 active:scale-[0.98]"
          >
            {isLoggingIn ? (
              <>
                <div className="w-4 h-4 border-2 border-[#ff7f00] border-t-transparent rounded-full animate-spin" />
                {t.auth.signingIn}
              </>
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                {t.auth.signInWithGoogle}
              </>
            )}
          </button>

          <div className="pt-6 border-t border-gray-100 text-center">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.1em] leading-relaxed">
              {t.auth.helpLine1} <br /> {t.auth.helpLine2}
            </p>
          </div>
        </div>
      </motion.div>
      <div className="mt-8 text-gray-400 text-[10px] uppercase tracking-widest font-bold opacity-50">
        © {new Date().getFullYear()} CARNELIAN ESCUDERIA
      </div>
    </div>
  );
}
