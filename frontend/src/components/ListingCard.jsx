import React, { useState } from 'react';
import categoryImages from '../data/categoryImages';
import DOMPurify from 'dompurify';
import { getListingImageStyle } from '../utils/listingImagePresentation';

const sanitizeText = (text) => {
  if (!text) return '';
  return DOMPurify.sanitize(String(text));
};

const ListingCard = ({ listing, onLocationClick }) => {
  const [isFavorite, setIsFavorite] = useState(false);

  const generateStars = (rating) => {
    const fullStars = Math.floor(rating);
    const halfStar = rating % 1 >= 0.5 ? 1 : 0;
    const emptyStars = 5 - fullStars - halfStar;
    
    let stars = [];
    for (let i = 0; i < fullStars; i++) stars.push(<i key={`full-${i}`} className="fas fa-star"></i>);
    if (halfStar) stars.push(<i key="half" className="fas fa-star-half-alt"></i>);
    for (let i = 0; i < emptyStars; i++) stars.push(<i key={`empty-${i}`} className="far fa-star"></i>);
    
    return stars;
  };

  return (
    <div className="listing-card">
      <div className="listing-thumb">
        <img
          src={categoryImages[listing.category] || listing.image || '/default-listing.svg'}
          alt={sanitizeText(listing.title)}
          style={getListingImageStyle(listing)}
          onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/default-listing.svg'; }}
        />
      </div>
      <div className="listing-main">
        <h3 className="listing-title">{sanitizeText(listing.title)}</h3>
        <div 
          className="listing-meta" 
          onClick={() => onLocationClick(listing.location)}
          style={{ cursor: 'pointer' }}
        >
          <i className="fas fa-map-marker-alt"></i>
          <span>{sanitizeText(listing.location)}</span>
        </div>
        <div className="listing-rating">
          <div className="stars">
            {generateStars(listing.rating)}
          </div>
          <span className="review-count">({listing.reviews})</span>
        </div>
        <div className="listing-price-row">
          <div className="listing-price">
            {listing.price} TL
          </div>
          <a href="#" className="view-details">عرض التفاصيل</a>
        </div>
        <div className="listing-footer">
          <div className="expert-info">
            <div className="expert-avatar">{sanitizeText(listing.expertAvatar)}</div>
            <span className="expert-name">{sanitizeText(listing.expertName)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ListingCard;
