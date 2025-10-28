// BUILDPRAX MEASURE PRO - Website JavaScript
document.addEventListener('DOMContentLoaded', function() {
    // Smooth scrolling for navigation links
    const navLinks = document.querySelectorAll('.nav a[href^="#"]');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const targetSection = document.querySelector(targetId);
            if (targetSection) {
                targetSection.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Add scroll effect to header
    let lastScrollTop = 0;
    const header = document.querySelector('.header');
    window.addEventListener('scroll', function() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        if (scrollTop > lastScrollTop && scrollTop > 100) {
            // Scrolling down
            header.style.transform = 'translateY(-100%)';
        } else {
            // Scrolling up
            header.style.transform = 'translateY(0)';
        }
        lastScrollTop = scrollTop;
    });

    // Add intersection observer for animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    // Observe feature cards and other elements
    const animatedElements = document.querySelectorAll('.feature-card, .download-card, .pricing-card, .support-card');
    animatedElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });
});

// Registration Modal Functions
function showRegistrationModal() {
    document.getElementById('registrationModal').style.display = 'block';
}

function closeRegistrationModal() {
    document.getElementById('registrationModal').style.display = 'none';
}

// Payment Modal Functions
function showPaymentModal() {
    document.getElementById('paymentModal').style.display = 'block';
    initializePayPalButton();
}

function closePaymentModal() {
    document.getElementById('paymentModal').style.display = 'none';
}

// Close modals when clicking outside
window.onclick = function(event) {
    const registrationModal = document.getElementById('registrationModal');
    const paymentModal = document.getElementById('paymentModal');
    
    if (event.target === registrationModal) {
        closeRegistrationModal();
    }
    if (event.target === paymentModal) {
        closePaymentModal();
    }
}

// Registration Form Handler
document.addEventListener('DOMContentLoaded', function() {
    const registrationForm = document.getElementById('registrationForm');
    if (registrationForm) {
        registrationForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Get form data
            const firstName = document.getElementById('firstName').value;
            const lastName = document.getElementById('lastName').value;
            const email = document.getElementById('email').value;
            const company = document.getElementById('company').value;
            const phone = document.getElementById('phone').value;
            
            // Basic validation
            if (!firstName || !lastName || !email) {
                showMessage('Please fill in all required fields.', 'error');
                return;
            }
            
            // Store customer data
            const customerData = {
                firstName: firstName,
                lastName: lastName,
                email: email,
                company: company,
                phone: phone,
                timestamp: new Date().toISOString(),
                type: 'trial_registration'
            };
            
            localStorage.setItem('customerData', JSON.stringify(customerData));
            
            // Submit to Formspree
            fetch('https://formspree.io/f/xblpgwzy', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    firstName: firstName,
                    lastName: lastName,
                    email: email,
                    company: company,
                    phone: phone,
                    message: 'New trial registration from website',
                    _subject: 'New BUILDPRAX MEASURE PRO Trial Registration'
                })
            })
            .then(response => {
                if (response.ok) {
                    // Start download immediately
                    startDownload();
                    closeRegistrationModal();
                    showMessage('Registration successful! Download starting...', 'success');
                } else {
                    showMessage('Registration failed. Please try again.', 'error');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                // Still start download even if form submission fails
                startDownload();
                closeRegistrationModal();
                showMessage('Download starting...', 'success');
            });
        });
    }
});

// Start Download Function
function startDownload() {
    const downloadLink = 'https://buildprax-downloads.sfo3.digitaloceanspaces.com/BUILDPRAX%20MEASURE%20PRO-1.0.0-arm64.dmg';
    const link = document.createElement('a');
    link.href = downloadLink;
    link.download = 'BUILDPRAX MEASURE PRO-1.0.0-arm64.dmg';
    link.click();
    
    // Track download
    const downloads = JSON.parse(localStorage.getItem('downloads') || '[]');
    downloads.push({
        timestamp: new Date().toISOString(),
        type: 'trial_download'
    });
    localStorage.setItem('downloads', JSON.stringify(downloads));
}

// Payment Method Selection
function selectPaymentMethod(method) {
    // Remove selected class from all methods
    document.querySelectorAll('.payment-method').forEach(el => {
        el.classList.remove('selected');
    });
    
    // Add selected class to clicked method
    event.currentTarget.classList.add('selected');
    
    // Show/hide card fields based on selection
    const cardFields = document.getElementById('cardFields');
    const paypalContainer = document.getElementById('paypal-button-container');
    
    if (method === 'card') {
        cardFields.style.display = 'block';
        paypalContainer.style.display = 'none';
    } else {
        cardFields.style.display = 'none';
        paypalContainer.style.display = 'block';
    }
}

// PayPal Button Initialization
function initializePayPalButton() {
    // Clear any existing buttons
    const container = document.getElementById('paypal-button-container');
    container.innerHTML = '';
    
    paypal.Buttons({
        createOrder: function(data, actions) {
            return actions.order.create({
                purchase_units: [{
                    amount: {
                        value: '299.00',
                        currency_code: 'USD'
                    },
                    description: 'BUILDPRAX MEASURE PRO - Pro License (1 Year)'
                }]
            });
        },
        onApprove: function(data, actions) {
            return actions.order.capture().then(function(details) {
                // Payment successful
                console.log('Payment completed:', details);
                
                // Get customer data
                const customerData = JSON.parse(localStorage.getItem('customerData') || '{}');
                const userEmail = customerData.email || details.payer.email_addresses[0].email_address;
                
                // Generate and send license key
                sendLicenseKey(userEmail, details);
                
                // Close modal
                closePaymentModal();
                
                // Show success message
                showMessage('Payment successful! Your license key has been sent to your email.', 'success');
            });
        },
        onError: function(err) {
            console.error('PayPal error:', err);
            showMessage('Payment failed. Please try again.', 'error');
        }
    }).render('#paypal-button-container');
}

// Handle Card Payment (Simulated)
function handleCardPayment() {
    const cardNumber = document.getElementById('cardNumber').value;
    const expiryDate = document.getElementById('expiryDate').value;
    const cvv = document.getElementById('cvv').value;
    const cardName = document.getElementById('cardName').value;
    
    // Basic validation
    if (!cardNumber || !expiryDate || !cvv || !cardName) {
        showMessage('Please fill in all card details.', 'error');
        return;
    }
    
    // Simulate payment processing
    showMessage('Processing payment...', 'success');
    
    setTimeout(() => {
        // Simulate successful payment
        const customerData = JSON.parse(localStorage.getItem('customerData') || '{}');
        const userEmail = customerData.email || 'customer@example.com';
        
        // Generate and send license key
        sendLicenseKey(userEmail, { id: 'card_' + Date.now() });
        
        // Close modal
        closePaymentModal();
        
        // Show success message
        showMessage('Payment successful! Your license key has been sent to your email.', 'success');
    }, 2000);
}

// Send License Key Function
function sendLicenseKey(email, paymentDetails) {
    // Generate license key
    const licenseKey = generateLicenseKey();
    
    // Store license key
    const licenses = JSON.parse(localStorage.getItem('licenses') || '[]');
    licenses.push({
        email: email,
        licenseKey: licenseKey,
        timestamp: new Date().toISOString(),
        paymentId: paymentDetails.id,
        amount: '299.00'
    });
    localStorage.setItem('licenses', JSON.stringify(licenses));
    
    // Send notification to support
    fetch('https://formspree.io/f/xblpgwzy', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            email: email,
            licenseKey: licenseKey,
            paymentId: paymentDetails.id,
            message: `New license key generated for ${email}`,
            _subject: 'BUILDPRAX MEASURE PRO - New License Key Generated'
        })
    })
    .then(response => {
        if (response.ok) {
            console.log('License key notification sent to support');
        }
    })
    .catch(error => {
        console.error('Error sending license key notification:', error);
    });
    
    console.log('License key generated:', licenseKey);
}

// Generate License Key Function
function generateLicenseKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 16; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
        if (i === 3 || i === 7 || i === 11) {
            result += '-';
        }
    }
    return result;
}

// Show Message Function
function showMessage(text, type) {
    // Remove existing messages
    const existingMessage = document.querySelector('.message');
    if (existingMessage) {
        existingMessage.remove();
    }
    
    // Create new message
    const message = document.createElement('div');
    message.className = `message ${type}`;
    message.textContent = text;
    
    // Insert at top of body
    document.body.insertBefore(message, document.body.firstChild);
    
    // Remove after 5 seconds
    setTimeout(() => {
        message.remove();
    }, 5000);
}

// Format Card Number
function formatCardNumber(input) {
    let value = input.value.replace(/\s/g, '').replace(/[^0-9]/gi, '');
    let formattedValue = value.match(/.{1,4}/g)?.join(' ') || value;
    if (formattedValue.length > 19) {
        formattedValue = formattedValue.substr(0, 19);
    }
    input.value = formattedValue;
}

// Format Expiry Date
function formatExpiryDate(input) {
    let value = input.value.replace(/\D/g, '');
    if (value.length >= 2) {
        value = value.substring(0, 2) + '/' + value.substring(2, 4);
    }
    input.value = value;
}

// Utility function to view stored data (for debugging)
function viewStoredData() {
    console.log('Customer Data:', JSON.parse(localStorage.getItem('customerData') || '{}'));
    console.log('Downloads:', JSON.parse(localStorage.getItem('downloads') || '[]'));
    console.log('Licenses:', JSON.parse(localStorage.getItem('licenses') || '[]'));
}