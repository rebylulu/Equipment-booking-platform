import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth'; // Removed signInAnonymously, signInWithCustomToken
import { getFirestore, collection, onSnapshot, doc, addDoc, updateDoc, deleteDoc, query, where, getDocs, Timestamp } from 'firebase/firestore';

// Define the global Firebase variables (provided by the Canvas environment)
const appId = 'demo-app'; // 你可以自己命名，比如 'test'、'booking-1' 等
const firebaseConfig = {
  apiKey: "AIzaSyBC6Jt_MDS4b9RbHO3giUox2uIGdI8cqbs",
  authDomain: "bookingplatform-8ca05.firebaseapp.com",
  projectId: "bookingplatform-8ca05",
  storageBucket: "bookingplatform-8ca05.firebasestorage.app",
  messagingSenderId: "216704990467",
  appId: "1:216704990467:web:070dd86312ef2f365d3d36",
  measurementId: "G-2TN5MYDXLW"
};
// initialAuthToken is for Canvas environment's automatic sign-in.
// We will explicitly control sign-in in this App component, so we won't use it for auto-login.
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Main App component
export default function App() {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [userDisplayName, setUserDisplayName] = useState('');
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [equipmentList, setEquipmentList] = useState([]);
  const [myBookings, setMyBookings] = useState([]);
  const [selectedEquipment, setSelectedEquipment] = useState(null);
  const [bookingForm, setBookingForm] = useState({ startDate: '', startTime: '', endDate: '', endTime: '', quantity: 1 });
  const [message, setMessage] = useState('');
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [bookingToCancel, setBookingToCancel] = useState(null);

  // Admin Panel states
  const [isAdmin, setIsAdmin] = useState(true); // For demo, assuming user is admin. In real app, this would be based on user role.
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showAddEquipmentModal, setShowAddEquipmentModal] = useState(false);
  const [newEquipmentForm, setNewEquipmentForm] = useState({ name: '', description: '', quantity: 1 });
  const [showEditEquipmentModal, setShowEditEquipmentModal] = useState(false);
  const [equipmentToEdit, setEquipmentToEdit] = useState(null);
  const [showDeleteEquipmentModal, setShowDeleteEquipmentModal] = useState(false);
  const [equipmentToDelete, setEquipmentToDelete] = useState(null);
  const [allPublicBookings, setAllPublicBookings] = useState([]);
  const [dashboardEquipmentData, setDashboardEquipmentData] = useState([]);

  // Initialize Firebase and set up authentication listener
  useEffect(() => {
    try {
      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const firebaseAuth = getAuth(app);

      setDb(firestore);
      setAuth(firebaseAuth);

      const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
        if (user) {
          // User is signed in (e.g., via Google)
          setUserId(user.uid);
          setUserDisplayName(user.displayName || user.email || 'Guest');
        } else {
          // User is signed out or no user is logged in
          setUserId(null);
          setUserDisplayName('');
          // IMPORTANT: No automatic anonymous sign-in here. User must explicitly sign in.
        }
        setIsAuthReady(true); // Auth state has been determined
      });

      return () => unsubscribe();
    } catch (error) {
      console.error("Error initializing Firebase:", error);
      setMessage(`Firebase initialization error: ${error.message}`);
    }
  }, []);

  // Keyboard listener for Admin Panel toggle (Ctrl + Alt + A)
  // NOTE: This keyboard shortcut might not work reliably within the Canvas iframe
  // due to browser/iframe security restrictions. A visible button is also provided.
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (isAdmin && event.ctrlKey && event.altKey && event.key.toLowerCase() === 'a') {
        event.preventDefault(); // Prevent browser default actions (like saving page)
        setShowAdminPanel(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isAdmin]);

  // Fetch equipment data when Firebase is ready
  useEffect(() => {
    if (db && isAuthReady) {
      const equipmentCollectionRef = collection(db, `artifacts/${appId}/public/data/equipment`);
      const unsubscribe = onSnapshot(equipmentCollectionRef, (snapshot) => {
        const equipmentData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setEquipmentList(equipmentData);
      }, (error) => {
        console.error("Error fetching equipment:", error);
        setMessage(`Error fetching equipment: ${error.message}`);
      });
      return () => unsubscribe();
    }
  }, [db, isAuthReady]);

  // Fetch user's bookings when Firebase and userId are ready
  useEffect(() => {
    // Only fetch if userId is available (user is authenticated)
    if (db && userId && isAuthReady) {
      const bookingsCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/bookings`);
      const unsubscribe = onSnapshot(bookingsCollectionRef, (snapshot) => {
        const bookingsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Sort bookings by start date
        setMyBookings(bookingsData.sort((a, b) => a.startDate.toMillis() - b.startDate.toMillis()));
      }, (error) => {
        console.error("Error fetching my bookings:", error);
        setMessage(`Error fetching your bookings: ${error.message}`);
      });
      return () => unsubscribe();
    } else if (isAuthReady && !userId) {
      // If auth is ready but no userId (user is signed out), clear bookings
      setMyBookings([]);
    }
  }, [db, userId, isAuthReady]);

  // Fetch all public bookings for dashboard availability calculations
  useEffect(() => {
    if (db && isAuthReady) {
      const publicBookingsCollectionRef = collection(db, `artifacts/${appId}/public/data/bookings`);
      const unsubscribe = onSnapshot(publicBookingsCollectionRef, (snapshot) => {
        const publicBookingsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAllPublicBookings(publicBookingsData);
      }, (error) => {
        console.error("Error fetching public bookings:", error);
      });
      return () => unsubscribe();
    }
  }, [db, isAuthReady]);

  // Calculate dashboard equipment data whenever equipmentList or allPublicBookings changes
  useEffect(() => {
    const now = new Date();
    const dashboardData = equipmentList.map(equipment => {
      let currentlyBookedQuantity = 0;
      allPublicBookings.forEach(booking => {
        // Only consider bookings that are currently active and for this equipment
        if (booking.equipmentId === equipment.id && booking.status === 'booked') {
          const bookingStart = booking.startDate.toDate();
          const bookingEnd = booking.endDate.toDate();
          // Check for current overlap: (now >= start) && (now <= end)
          if (now.getTime() >= bookingStart.getTime() && now.getTime() <= bookingEnd.getTime()) {
            currentlyBookedQuantity += booking.quantity;
          }
        }
      });
      const currentlyAvailable = equipment.quantity - currentlyBookedQuantity;
      return {
        ...equipment,
        currentlyBooked: currentlyBookedQuantity,
        currentlyAvailable: currentlyAvailable > 0 ? currentlyAvailable : 0 // Ensure not negative
      };
    });
    setDashboardEquipmentData(dashboardData);
  }, [equipmentList, allPublicBookings]);


  // Handle booking form changes
  const handleBookingFormChange = (e) => {
    const { name, value } = e.target;
    setBookingForm(prev => ({ ...prev, [name]: value }));
  };

  // Open booking modal
  const openBookingModal = (equipment) => {
    setSelectedEquipment(equipment);
    const now = new Date();
    const today = now.toISOString().split('T')[0]; // Current date in YYYY-MM-DD format

    let startHour = now.getHours();
    let startMinute = now.getMinutes();

    // Round up current minute to the nearest 5-minute interval for a user-friendly default
    let roundedMinute = Math.ceil(startMinute / 5) * 5;
    if (roundedMinute === 60) {
        startHour++;
        roundedMinute = 0;
    }
    // Handle hour overflow if rounding minutes pushed it to the next day
    let defaultStartDate = today;
    if (startHour >= 24) { // If it pushed to next day
        startHour = 0; // Reset hour to 0 for the new day
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);
        defaultStartDate = tomorrow.toISOString().split('T')[0];
    }

    const defaultStartTime = `${startHour.toString().padStart(2, '0')}:${roundedMinute.toString().padStart(2, '0')}`;

    // Calculate default end time: 2 hours from the (rounded) start time
    const tempStartDate = new Date(`${defaultStartDate}T${defaultStartTime}:00`);
    let endDateTimeCalc = new Date(tempStartDate.getTime() + (2 * 60 * 60 * 1000)); // Add 2 hours in milliseconds

    // Cap end time at 17:00 if it goes past for default (business logic, can be removed)
    const capHour = 17;
    const capMinute = 0;
    const capDateForDefaultStartDate = new Date(`${defaultStartDate}T${capHour.toString().padStart(2, '0')}:${capMinute.toString().padStart(2, '0')}:00`);

    if (endDateTimeCalc.getFullYear() === capDateForDefaultStartDate.getFullYear() &&
        endDateTimeCalc.getMonth() === capDateForDefaultStartDate.getMonth() &&
        endDateTimeCalc.getDate() === capDateForDefaultStartDate.getDate() &&
        endDateTimeCalc.getTime() > capDateForDefaultStartDate.getTime()) {
        endDateTimeCalc = capDateForDefaultStartDate;
    }

    const defaultEndDate = endDateTimeCalc.toISOString().split('T')[0];
    const defaultEndTime = `${endDateTimeCalc.getHours().toString().padStart(2, '0')}:${endDateTimeCalc.getMinutes().toString().padStart(2, '0')}`;

    setBookingForm({
      startDate: defaultStartDate,
      startTime: defaultStartTime,
      endDate: defaultEndDate,
      endTime: defaultEndTime,
      quantity: 1
    });
    setShowBookingModal(true);
  };

  // Close booking modal
  const closeBookingModal = () => {
    setShowBookingModal(false);
    setSelectedEquipment(null);
    setMessage('');
  };

  // Open cancel booking confirmation modal
  const openCancelModal = (booking) => {
    setBookingToCancel(booking);
    setShowCancelModal(true);
  };

  // Close cancel booking modal
  const closeCancelModal = () => {
    setShowCancelModal(false);
    setBookingToCancel(null);
    setMessage('');
  };

  // Submit new booking
  const submitBooking = async (e) => {
    e.preventDefault();
    if (!selectedEquipment || !db || !userId) {
      setMessage('Error: Missing equipment data or user ID. Please sign in to book.');
      return;
    }

    const { startDate, startTime, endDate, endTime, quantity } = bookingForm;
    
    const startDateTimeString = `${startDate}T${startTime}:00`;
    const endDateTimeString = `${endDate}T${endTime}:00`;

    const startDateTime = new Date(startDateTimeString);
    const endDateTime = new Date(endDateTimeString);

    const startTimestamp = Timestamp.fromDate(startDateTime);
    const endTimestamp = Timestamp.fromDate(endDateTime);

    const requestedQuantity = parseInt(quantity, 10);

    if (isNaN(requestedQuantity) || requestedQuantity <= 0) {
      setMessage('Please enter a valid quantity.');
      return;
    }
    if (startDateTime.getTime() >= endDateTime.getTime()) {
      setMessage('Start date/time cannot be on or after end date/time.');
      return;
    }
    const now = new Date();
    const nowRoundedToMinute = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), 0, 0);

    if (startDateTime.getTime() < nowRoundedToMinute.getTime()) {
      setMessage('Start date/time cannot be in the past. Please select a time in the current minute or later.');
      return;
    }

    try {
      const publicBookingsCollectionRef = collection(db, `artifacts/${appId}/public/data/bookings`);
      const q = query(
        publicBookingsCollectionRef,
        where('equipmentId', '==', selectedEquipment.id),
        where('status', '==', 'booked') // Fetch all booked status for this equipment
      );
      const existingBookingsSnapshot = await getDocs(q);

      let bookedQuantityDuringPeriod = 0;
      existingBookingsSnapshot.forEach(docSnap => {
        const existingBooking = docSnap.data();
        const existingStart = existingBooking.startDate.toDate();
        const existingEnd = existingBooking.endDate.toDate();

        // Check for overlap: (StartA < EndB) && (EndA > StartB)
        if (startDateTime.getTime() < existingEnd.getTime() && endDateTime.getTime() > existingStart.getTime()) {
          bookedQuantityDuringPeriod += existingBooking.quantity;
        }
      });

      const currentlyAvailable = selectedEquipment.quantity - bookedQuantityDuringPeriod;

      if (currentlyAvailable < requestedQuantity) {
        setMessage(`Not enough quantity available for selected dates/times. Only ${currentlyAvailable} of "${selectedEquipment.name}" available.`);
        return;
      }

      await addDoc(collection(db, `artifacts/${appId}/users/${userId}/bookings`), {
        equipmentId: selectedEquipment.id,
        equipmentName: selectedEquipment.name,
        userId: userId, // Use authenticated userId
        userDisplayName: userDisplayName, // Store user's display name
        startDate: startTimestamp,
        endDate: endTimestamp,
        quantity: requestedQuantity,
        status: 'booked',
        bookedAt: Timestamp.now(),
      });

      await addDoc(publicBookingsCollectionRef, {
        equipmentId: selectedEquipment.id,
        equipmentName: selectedEquipment.name,
        userId: userId, // Use authenticated userId
        userDisplayName: userDisplayName, // Store user's display name
        startDate: startTimestamp,
        endDate: endTimestamp,
        quantity: requestedQuantity,
        status: 'booked',
        bookedAt: Timestamp.now(),
      });

      setMessage(`"${requestedQuantity}x ${selectedEquipment.name}" booked successfully from ${startDateTime.toLocaleString()} to ${endDateTime.toLocaleString()}!`);
      closeBookingModal();
    } catch (error) {
      console.error("Error booking equipment:", error);
      setMessage(`Error booking: ${error.message}`);
    }
  };

  // Cancel an existing booking
  const cancelBooking = async () => {
    if (!bookingToCancel || !db || !userId) {
      setMessage('Error: Missing booking data or user ID.');
      return;
    }

    try {
      const userBookingDocRef = doc(db, `artifacts/${appId}/users/${userId}/bookings`, bookingToCancel.id);
      await updateDoc(userBookingDocRef, {
        status: 'cancelled',
        cancelledAt: Timestamp.now(),
      });

      const publicBookingsCollectionRef = collection(db, `artifacts/${appId}/public/data/bookings`);
      const q = query(
        publicBookingsCollectionRef,
        where('equipmentId', '==', bookingToCancel.equipmentId),
        where('userId', '==', bookingToCancel.userId), // Ensure we're canceling the correct user's public booking
        where('status', '==', 'booked') // Only look for active bookings to cancel
      );
      const publicBookingsSnapshot = await getDocs(q);

      let foundPublicBooking = false;
      publicBookingsSnapshot.forEach(docSnap => {
        const publicBooking = docSnap.data();
        // Perform a precise client-side match to find the specific booking to cancel
        if (publicBooking.startDate.toMillis() === bookingToCancel.startDate.toMillis() &&
            publicBooking.endDate.toMillis() === bookingToCancel.endDate.toMillis() &&
            publicBooking.quantity === bookingToCancel.quantity &&
            publicBooking.bookedAt.toMillis() === bookingToCancel.bookedAt.toMillis()) {
          
            updateDoc(doc(db, `artifacts/${appId}/public/data/bookings`, docSnap.id), {
              status: 'cancelled',
              cancelledAt: Timestamp.now(),
            });
            foundPublicBooking = true;
        }
      });

      if (!foundPublicBooking) {
        console.warn("Corresponding public booking not found for cancellation using precise match.");
      }

      setMessage(`Booking for "${bookingToCancel.equipmentName}" cancelled successfully!`);
      closeCancelModal();
    } catch (error) {
      console.error("Error cancelling booking:", error);
      setMessage(`Error cancelling: ${error.message}`);
    }
  };

  // Admin functions: Add Equipment
  const handleNewEquipmentFormChange = (e) => {
    const { name, value } = e.target;
    setNewEquipmentForm(prev => ({ ...prev, [name]: name === 'quantity' ? parseInt(value, 10) : value }));
  };

  const addEquipment = async (e) => {
    e.preventDefault();
    if (!db || !isAdmin) {
      setMessage('Error: Not authorized or database not ready.');
      return;
    }
    if (!newEquipmentForm.name || !newEquipmentForm.description || newEquipmentForm.quantity <= 0) {
      setMessage('Please fill all fields and ensure quantity is positive.');
      return;
    }

    try {
      await addDoc(collection(db, `artifacts/${appId}/public/data/equipment`), {
        name: newEquipmentForm.name,
        description: newEquipmentForm.description,
        quantity: newEquipmentForm.quantity,
        createdAt: Timestamp.now()
      });
      setMessage(`Equipment "${newEquipmentForm.name}" added successfully!`);
      setShowAddEquipmentModal(false);
      setNewEquipmentForm({ name: '', description: '', quantity: 1 });
    } catch (error) {
      console.error("Error adding equipment:", error);
      setMessage(`Error adding equipment: ${error.message}`);
    }
  };

  // Admin functions: Edit Equipment
  const openEditEquipmentModal = (equipment) => {
    setEquipmentToEdit(equipment);
    setNewEquipmentForm({ name: equipment.name, description: equipment.description, quantity: equipment.quantity });
    setShowEditEquipmentModal(true);
  };

  const closeEditEquipmentModal = () => {
    setShowEditEquipmentModal(false);
    setEquipmentToEdit(null);
    setNewEquipmentForm({ name: '', description: '', quantity: 1 });
    setMessage('');
  };

  const updateEquipment = async (e) => {
    e.preventDefault();
    if (!db || !isAdmin || !equipmentToEdit) {
      setMessage('Error: Not authorized or database not ready.');
      return;
    }
    if (!newEquipmentForm.name || !newEquipmentForm.description || newEquipmentForm.quantity <= 0) {
      setMessage('Please fill all fields and ensure quantity is positive.');
      return;
    }

    try {
      const equipmentDocRef = doc(db, `artifacts/${appId}/public/data/equipment`, equipmentToEdit.id);
      await updateDoc(equipmentDocRef, {
        name: newEquipmentForm.name,
        description: newEquipmentForm.description,
        quantity: newEquipmentForm.quantity,
        updatedAt: Timestamp.now()
      });
      setMessage(`Equipment "${newEquipmentForm.name}" updated successfully!`);
      closeEditEquipmentModal();
    } catch (error) {
      console.error("Error updating equipment:", error);
      setMessage(`Error updating equipment: ${error.message}`);
    }
  };

  // Admin functions: Delete Equipment
  const openDeleteEquipmentModal = (equipment) => {
    setEquipmentToDelete(equipment);
    setShowDeleteEquipmentModal(true);
  };

  const closeDeleteEquipmentModal = () => {
    setShowDeleteEquipmentModal(false);
    setEquipmentToDelete(null);
    setMessage('');
  };

  const deleteEquipment = async () => {
    if (!db || !isAdmin || !equipmentToDelete) {
      setMessage('Error: Not authorized or database not ready.');
      return;
    }

    try {
      const publicBookingsCollectionRef = collection(db, `artifacts/${appId}/public/data/bookings`);
      const q = query(
        publicBookingsCollectionRef,
        where('equipmentId', '==', equipmentToDelete.id),
        where('status', '==', 'booked')
      );
      const activeBookingsSnapshot = await getDocs(q);

      if (!activeBookingsSnapshot.empty) {
        setMessage(`Cannot delete "${equipmentToDelete.name}". There are active bookings for this equipment.`);
        closeDeleteEquipmentModal();
        return;
      }

      await deleteDoc(doc(db, `artifacts/${appId}/public/data/equipment`, equipmentToDelete.id));
      setMessage(`Equipment "${equipmentToDelete.name}" deleted successfully!`);
      closeDeleteEquipmentModal();
    } catch (error) {
      console.error("Error deleting equipment:", error);
      setMessage(`Error deleting equipment: ${error.message}`);
    }
  };

  // Function to handle Google Sign-In
  const signInWithGoogle = async () => {
    if (!auth) {
      setMessage('Authentication service not available.');
      return;
    }
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      setMessage('Signed in with Google successfully!');
    } catch (error) {
      console.error("Error signing in with Google:", error);
      setMessage(`Google Sign-In failed: ${error.message}`);
    }
  };

  // Function to handle Sign Out
  const handleSignOut = async () => {
    if (!auth) {
      setMessage('Authentication service not available.');
      return;
    }
    try {
      await signOut(auth);
      setMessage('Signed out successfully!');
    } catch (error) {
      console.error("Error signing out:", error);
      setMessage(`Sign Out failed: ${error.message}`);
    }
  };

  // Format Timestamp to readable date and time string
  const formatDateTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate();
    const options = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: true
    };
    return date.toLocaleString('en-US', options);
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <div className="bg-white p-6 rounded-lg shadow-lg text-center">
          <p className="text-xl font-semibold text-gray-700">Loading platform...</p>
          <p className="text-sm text-gray-500 mt-2">Please wait while we set up the environment.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-800 p-4 sm:p-6 lg:p-8 flex flex-col items-center">
      <div className="w-full max-w-4xl bg-white rounded-xl shadow-2xl p-6 sm:p-8 lg:p-10">
        <h1 className="text-4xl font-extrabold text-indigo-700 mb-6 text-center">
          Equipment Booking Platform
        </h1>

        {/* User Info and Auth Buttons */}
        <div className="mb-6 p-4 bg-indigo-50 rounded-lg shadow-inner text-center">
          {userId ? ( // If a user is logged in (Google)
            <div>
              <p className="text-sm text-indigo-700">
                Logged in as: <span className="font-semibold">{userDisplayName}</span>
              </p>
              <p className="text-sm text-indigo-700 mt-1">
                Your User ID: <span className="font-mono bg-indigo-100 px-2 py-1 rounded-md text-xs sm:text-sm break-all">{userId}</span>
              </p>
              <button
                onClick={handleSignOut}
                className="mt-4 bg-red-500 text-white py-2 px-4 rounded-md font-semibold hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-75 transition-colors duration-200"
              >
                Sign Out
              </button>
            </div>
          ) : ( // If no user is logged in (after initial load or sign out)
            <div>
              <p className="text-sm text-indigo-700">Please sign in with your Google account to book equipment.</p>
              <button
                onClick={signInWithGoogle}
                className="mt-4 bg-blue-600 text-white py-2 px-4 rounded-md font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75 transition-colors duration-200"
              >
                Sign In with Google
              </button>
            </div>
          )}
        </div>

        {/* Admin Panel Toggle Button */}
        {isAdmin && (
          <div className="flex justify-center mb-6">
            <button
              onClick={() => setShowAdminPanel(prev => !prev)}
              className="bg-purple-600 text-white py-2 px-6 rounded-md font-semibold hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-75 transition-colors duration-200"
              title="Press Ctrl+Alt+A to toggle Admin Panel (may not work in iframe)"
            >
              {showAdminPanel ? 'Hide Admin Panel' : 'Show Admin Panel'}
            </button>
          </div>
        )}

        {message && (
          <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded relative mb-6" role="alert">
            <strong className="font-bold">Info: </strong>
            <span className="block sm:inline">{message}</span>
            <span className="absolute top-0 bottom-0 right-0 px-4 py-3" onClick={() => setMessage('')}>
              <svg className="fill-current h-6 w-6 text-yellow-500" role="button" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><title>Close</title><path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z"/></svg>
            </span>
          </div>
        )}

        {/* Equipment Dashboard - Always visible if isAdmin */}
        {isAdmin && (
          <section className="mb-10 p-6 bg-blue-50 border border-blue-200 rounded-xl shadow-lg w-full">
            <h2 className="text-3xl font-bold text-blue-700 mb-6 text-center">Equipment Dashboard</h2>
            
            <h3 className="text-2xl font-semibold text-gray-800 mb-4 text-center">Equipment Overview</h3>
            {dashboardEquipmentData.length === 0 ? (
              <p className="text-center text-gray-600 italic">No equipment data for dashboard.</p>
            ) : (
              <div className="overflow-x-auto mb-8">
                <table className="min-w-full bg-white rounded-lg shadow-md">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider rounded-tl-lg">Equipment Name</th>
                      <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">Total Quantity</th>
                      <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">Currently Booked</th>
                      <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider rounded-tr-lg">Currently Available</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboardEquipmentData.map(item => (
                      <tr key={item.id} className="border-b border-gray-200 last:border-b-0 hover:bg-gray-50">
                        <td className="py-3 px-4 text-sm text-gray-800 font-medium">{item.name}</td>
                        <td className="py-3 px-4 text-sm text-gray-800">{item.quantity}</td>
                        <td className="py-3 px-4 text-sm text-gray-800">{item.currentlyBooked}</td>
                        <td className="py-3 px-4 text-sm text-gray-800">{item.currentlyAvailable}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h3 className="text-2xl font-semibold text-gray-800 mb-4 text-center">All Active Bookings</h3>
            {allPublicBookings.filter(b => b.status === 'booked' && b.endDate.toDate() >= new Date()).length === 0 ? (
              <p className="text-center text-gray-600 italic">No active bookings found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white rounded-lg shadow-md">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider rounded-tl-lg">Equipment</th>
                      <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">User ID</th>
                      <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">Quantity</th>
                      <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">From</th>
                      <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">To</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allPublicBookings
                      .filter(b => b.status === 'booked' && b.endDate.toDate() >= new Date()) // Only show current/future active bookings
                      .sort((a,b) => a.startDate.toMillis() - b.startDate.toMillis()) // Sort by start time
                      .map(booking => (
                        <tr key={booking.id} className="border-b border-gray-200 last:border-b-0 hover:bg-gray-50">
                          <td className="py-3 px-4 text-sm text-gray-800 font-medium">{booking.equipmentName}</td>
                          <td className="py-3 px-4 text-sm text-gray-800 break-all">{booking.userId}</td>
                          <td className="py-3 px-4 text-sm text-gray-800">{booking.quantity}</td>
                          <td className="py-3 px-4 text-sm text-gray-800">{formatDateTime(booking.startDate)}</td>
                          <td className="py-3 px-4 text-sm text-gray-800">{formatDateTime(booking.endDate)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* Admin Management Panel - Toggled by Ctrl+Alt + A */}
        {isAdmin && showAdminPanel && (
          <section className="mb-10 p-6 bg-purple-50 border border-purple-200 rounded-xl shadow-lg w-full">
            <h2 className="text-3xl font-bold text-purple-700 mb-6 text-center">Admin Management</h2>
            
            <div className="flex justify-center mb-6">
              <button
                onClick={() => setShowAddEquipmentModal(true)}
                className="bg-purple-600 text-white py-2 px-6 rounded-md font-semibold hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-75 transition-colors duration-200"
              >
                + Add New Equipment
              </button>
            </div>

            <h3 className="text-2xl font-semibold text-gray-800 mb-4 mt-8">Manage Equipment</h3>
            {equipmentList.length === 0 ? (
                <p className="text-center text-gray-600 italic">No equipment to manage.</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="min-w-full bg-white rounded-lg shadow-md">
                        <thead className="bg-gray-100">
                            <tr>
                                <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider rounded-tl-lg">Name</th>
                                <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">Quantity</th>
                                <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">Description</th>
                                <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider rounded-tr-lg">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {equipmentList.map(equipment => (
                                <tr key={equipment.id} className="border-b border-gray-200 last:border-b-0 hover:bg-gray-50">
                                    <td className="py-3 px-4 text-sm text-gray-800 font-medium">{equipment.name}</td>
                                    <td className="py-3 px-4 text-sm text-gray-800">{equipment.quantity}</td>
                                    <td className="py-3 px-4 text-sm text-gray-800 max-w-xs overflow-hidden text-ellipsis whitespace-nowrap">{equipment.description}</td>
                                    <td className="py-3 px-4 text-sm flex gap-2">
                                        <button
                                            onClick={() => openEditEquipmentModal(equipment)}
                                            className="bg-yellow-500 text-white py-1 px-3 rounded-md text-xs font-semibold hover:bg-yellow-600 transition-colors duration-200"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            onClick={() => openDeleteEquipmentModal(equipment)}
                                            className="bg-red-500 text-white py-1 px-3 rounded-md text-xs font-semibold hover:bg-red-600 transition-colors duration-200"
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
          </section>
        )}

        <section className="mb-10">
          <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center">Available Equipment</h2>
          {equipmentList.length === 0 ? (
            <p className="text-center text-gray-600 italic">No equipment available at the moment. Please check back later!</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {equipmentList.map(equipment => (
                <div key={equipment.id} className="bg-gradient-to-br from-white to-gray-50 border border-gray-200 rounded-lg shadow-md p-6 flex flex-col transform transition-transform hover:scale-105 hover:shadow-xl">
                  <h3 className="text-xl font-semibold text-indigo-600 mb-2">{equipment.name}</h3>
                  <p className="text-gray-700 text-sm mb-3 flex-grow">{equipment.description}</p>
                  <div className="text-gray-600 text-sm mb-4">
                    Total Quantity: <span className="font-medium">{equipment.quantity}</span>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 mt-auto">
                    <button
                      onClick={() => openBookingModal(equipment)}
                      className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md font-semibold hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-75 transition-colors duration-200"
                    >
                      Book Now
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center">My Bookings</h2>
          {myBookings.length === 0 ? (
            <p className="text-center text-gray-600 italic">You have no active bookings.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full bg-white rounded-lg shadow-md">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider rounded-tl-lg">Equipment</th>
                    <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">Quantity</th>
                    <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">From</th>
                    <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">To</th>
                    <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                    <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider rounded-tr-lg">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {myBookings.map(booking => (
                    <tr key={booking.id} className="border-b border-gray-200 last:border-b-0 hover:bg-gray-50">
                      <td className="py-3 px-4 text-sm text-gray-800 font-medium">{booking.equipmentName}</td>
                      <td className="py-3 px-4 text-sm text-gray-800">{booking.quantity}</td>
                      <td className="py-3 px-4 text-sm text-gray-800">{formatDateTime(booking.startDate)}</td>
                      <td className="py-3 px-4 text-sm text-gray-800">{formatDateTime(booking.endDate)}</td>
                      <td className="py-3 px-4 text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          booking.status === 'booked' ? 'bg-green-100 text-green-800' :
                          booking.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {booking.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm">
                        {booking.status === 'booked' && (
                          <button
                            onClick={() => openCancelModal(booking)}
                            className="bg-red-500 text-white py-1 px-3 rounded-md text-xs font-semibold hover:bg-red-600 transition-colors duration-200"
                          >
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Booking Modal */}
      {showBookingModal && selectedEquipment && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 sm:p-8 transform transition-transform animate-slide-up">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 text-center">Book "{selectedEquipment.name}"</h2>
            <form onSubmit={submitBooking}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label htmlFor="startDate" className="block text-gray-700 text-sm font-semibold mb-2">Start Date</label>
                  <input
                    type="date"
                    id="startDate"
                    name="startDate"
                    value={bookingForm.startDate}
                    onChange={handleBookingFormChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="startTime" className="block text-gray-700 text-sm font-semibold mb-2">Start Time</label>
                  <input
                    type="time"
                    id="startTime"
                    name="startTime"
                    value={bookingForm.startTime}
                    onChange={handleBookingFormChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label htmlFor="endDate" className="block text-gray-700 text-sm font-semibold mb-2">End Date</label>
                  <input
                    type="date"
                    id="endDate"
                    name="endDate"
                    value={bookingForm.endDate}
                    onChange={handleBookingFormChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="endTime" className="block text-gray-700 text-sm font-semibold mb-2">End Time</label>
                  <input
                    type="time"
                    id="endTime"
                    name="endTime"
                    value={bookingForm.endTime}
                    onChange={handleBookingFormChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>
              </div>
              <div className="mb-6">
                <label htmlFor="quantity" className="block text-gray-700 text-sm font-semibold mb-2">Quantity</label>
                <input
                  type="number"
                  id="quantity"
                  name="quantity"
                  value={bookingForm.quantity}
                  onChange={handleBookingFormChange}
                  min="1"
                  max={selectedEquipment.quantity} // Max quantity based on total available
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Available: {selectedEquipment.quantity}</p>
              </div>
              {message && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded relative text-sm mb-4" role="alert">
                  {message}
                </div>
              )}
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={closeBookingModal}
                  className="bg-gray-300 text-gray-800 py-2 px-4 rounded-md font-semibold hover:bg-gray-400 transition-colors duration-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 text-white py-2 px-4 rounded-md font-semibold hover:bg-indigo-700 transition-colors duration-200"
                >
                  Confirm Booking
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {showCancelModal && bookingToCancel && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6 sm:p-8 transform transition-transform animate-slide-up">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 text-center">Confirm Cancellation</h2>
            <p className="text-gray-700 mb-6 text-center">
              Are you sure you want to cancel your booking for <span className="font-semibold">"{bookingToCancel.equipmentName}"</span> (Quantity: {bookingToCancel.quantity}) from {formatDateTime(bookingToCancel.startDate)} to {formatDateTime(bookingToCancel.endDate)}?
            </p>
            {message && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded relative text-sm mb-4" role="alert">
                {message}
              </div>
            )}
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={closeCancelModal}
                className="bg-gray-300 text-gray-800 py-2 px-4 rounded-md font-semibold hover:bg-gray-400 transition-colors duration-200"
              >
                No, Keep Booking
              </button>
              <button
                type="button"
                onClick={cancelBooking}
                className="bg-red-600 text-white py-2 px-4 rounded-md font-semibold hover:bg-red-700 transition-colors duration-200"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add New Equipment Modal */}
      {showAddEquipmentModal && isAdmin && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 sm:p-8 transform transition-transform animate-slide-up">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 text-center">Add New Equipment</h2>
            <form onSubmit={addEquipment}>
              <div className="mb-4">
                <label htmlFor="newName" className="block text-gray-700 text-sm font-semibold mb-2">Equipment Name</label>
                <input
                  type="text"
                  id="newName"
                  name="name"
                  value={newEquipmentForm.name}
                  onChange={handleNewEquipmentFormChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  required
                />
              </div>
              <div className="mb-4">
                <label htmlFor="newDescription" className="block text-gray-700 text-sm font-semibold mb-2">Description</label>
                <textarea
                  id="newDescription"
                  name="description"
                  value={newEquipmentForm.description}
                  onChange={handleNewEquipmentFormChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  rows="3"
                  required
                ></textarea>
              </div>
              <div className="mb-6">
                <label htmlFor="newQuantity" className="block text-gray-700 text-sm font-semibold mb-2">Total Quantity</label>
                <input
                  type="number"
                  id="newQuantity"
                  name="quantity"
                  value={newEquipmentForm.quantity}
                  onChange={handleNewEquipmentFormChange}
                  min="1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  required
                />
              </div>
              {message && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded relative text-sm mb-4" role="alert">
                  {message}
                </div>
              )}
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowAddEquipmentModal(false)}
                  className="bg-gray-300 text-gray-800 py-2 px-4 rounded-md font-semibold hover:bg-gray-400 transition-colors duration-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-purple-600 text-white py-2 px-4 rounded-md font-semibold hover:bg-purple-700 transition-colors duration-200"
                >
                  Add Equipment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Equipment Modal */}
      {showEditEquipmentModal && isAdmin && equipmentToEdit && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 sm:p-8 transform transition-transform animate-slide-up">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 text-center">Edit "{equipmentToEdit.name}"</h2>
            <form onSubmit={updateEquipment}>
              <div className="mb-4">
                <label htmlFor="editName" className="block text-gray-700 text-sm font-semibold mb-2">Equipment Name</label>
                <input
                  type="text"
                  id="editName"
                  name="name"
                  value={newEquipmentForm.name}
                  onChange={handleNewEquipmentFormChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  required
                />
              </div>
              <div className="mb-4">
                <label htmlFor="editDescription" className="block text-gray-700 text-sm font-semibold mb-2">Description</label>
                <textarea
                  id="editDescription"
                  name="description"
                  value={newEquipmentForm.description}
                  onChange={handleNewEquipmentFormChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  rows="3"
                  required
                ></textarea>
              </div>
              <div className="mb-6">
                <label htmlFor="editQuantity" className="block text-gray-700 text-sm font-semibold mb-2">Total Quantity</label>
                <input
                  type="number"
                  id="editQuantity"
                  name="quantity"
                  value={newEquipmentForm.quantity}
                  onChange={handleNewEquipmentFormChange}
                  min="1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  required
                />
              </div>
              {message && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded relative text-sm mb-4" role="alert">
                  {message}
                </div>
              )}
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={closeEditEquipmentModal}
                  className="bg-gray-300 text-gray-800 py-2 px-4 rounded-md font-semibold hover:bg-gray-400 transition-colors duration-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-purple-600 text-white py-2 px-4 rounded-md font-semibold hover:bg-purple-700 transition-colors duration-200"
                >
                  Update Equipment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Equipment Confirmation Modal */}
      {showDeleteEquipmentModal && isAdmin && equipmentToDelete && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6 sm:p-8 transform transition-transform animate-slide-up">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 text-center">Confirm Deletion</h2>
            <p className="text-gray-700 mb-6 text-center">
              Are you sure you want to delete <span className="font-semibold">"{equipmentToDelete.name}"</span>? This action cannot be undone.
            </p>
            {message && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded relative text-sm mb-4" role="alert">
                {message}
              </div>
            )}
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={closeDeleteEquipmentModal}
                className="bg-gray-300 text-gray-800 py-2 px-4 rounded-md font-semibold hover:bg-gray-400 transition-colors duration-200"
              >
                No, Keep Equipment
              </button>
              <button
                type="button"
                onClick={deleteEquipment}
                className="bg-red-600 text-white py-2 px-4 rounded-md font-semibold hover:bg-red-700 transition-colors duration-200"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tailwind CSS for animations and custom loader */}
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slide-up {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out forwards;
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out forwards;
        }
        .loader {
          border-top-color: #3498db;
          -webkit-animation: spin 1s linear infinite;
          animation: spin 1s linear infinite;
        }
        @-webkit-keyframes spin {
          0% { -webkit-transform: rotate(0deg); }
          100% { -webkit-transform: rotate(360deg); }
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
