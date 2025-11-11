import React, { createContext, useContext, useState, ReactNode } from 'react';
import { User, Trip, Conversation } from '../types';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (user: User) => void;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
  trips: Trip[];
  addTrip: (trip: Trip) => void;
  updateTrip: (id: string, updates: Partial<Trip>) => void;
  conversations: Conversation[];
  unreadMessagesCount: number;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [trips, setTrips] = useState<Trip[]>([
    {
      id: '1',
      driverId: '123',
      driverName: 'Jean Mukendi',
      driverRating: 4.8,
      vehicleType: 'car',
      vehicleInfo: 'Toyota Corolla blanche',
      departure: { name: 'Gombe', address: 'Ave de la Justice', lat: -4.3276, lng: 15.3222 },
      arrival: { name: 'Lemba', address: 'Campus Unikin', lat: -4.4040, lng: 15.2821 },
      departureTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
      arrivalTime: new Date(Date.now() + 2.5 * 60 * 60 * 1000),
      price: 2000,
      availableSeats: 2,
      totalSeats: 4,
      status: 'upcoming',
    },
    {
      id: '2',
      driverId: '456',
      driverName: 'Marie Kabongo',
      driverRating: 4.9,
      vehicleType: 'moto',
      vehicleInfo: 'Honda rouge',
      departure: { name: 'Kintambo', address: 'Marché Kintambo', lat: -4.3333, lng: 15.2986 },
      arrival: { name: 'Ngaliema', address: 'Rond-point Ngaliema', lat: -4.3821, lng: 15.2663 },
      departureTime: new Date(Date.now() + 1 * 60 * 60 * 1000),
      arrivalTime: new Date(Date.now() + 1.25 * 60 * 60 * 1000),
      price: 1000,
      availableSeats: 1,
      totalSeats: 1,
      status: 'upcoming',
    },
  ]);

  const [conversations, setConversations] = useState<Conversation[]>([
    {
      id: '1',
      userId: '123',
      userName: 'Jean Mukendi',
      lastMessage: 'Rendez-vous au rond-point ?',
      timestamp: new Date(Date.now() - 10 * 60 * 1000),
      unreadCount: 2,
    },
    {
      id: '2',
      userId: '456',
      userName: 'Marie Kabongo',
      lastMessage: "J'arrive dans 5 minutes",
      timestamp: new Date(Date.now() - 30 * 60 * 1000),
      unreadCount: 1,
    },
  ]);

  const login = (userData: User) => {
    setUser(userData);
  };

  const logout = () => {
    setUser(null);
  };

  const updateUser = (updates: Partial<User>) => {
    if (user) {
      setUser({ ...user, ...updates });
    }
  };

  const addTrip = (trip: Trip) => {
    setTrips([...trips, trip]);
  };

  const updateTrip = (id: string, updates: Partial<Trip>) => {
    setTrips(trips.map(trip => trip.id === id ? { ...trip, ...updates } : trip));
  };

  const unreadMessagesCount = conversations.reduce((sum, conv) => sum + conv.unreadCount, 0);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      login,
      logout,
      updateUser,
      trips,
      addTrip,
      updateTrip,
      conversations,
      unreadMessagesCount,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

