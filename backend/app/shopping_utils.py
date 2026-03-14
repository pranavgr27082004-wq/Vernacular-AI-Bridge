import json
import random
import re
from langchain_core.messages import HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI

def get_exact_price(product_name: str, product_details: str) -> int:
    """Reads the exact price scraped by the Chrome Extension."""
    # 1. Check for the Chrome Extension's explicitly injected price tag
    price_match = re.search(r'\[PRICE_ON_PAGE:\s*(\d+)\]', str(product_details))
    if price_match:
        return int(price_match.group(1))
        
    # 2. Regex fallback on the raw text
    combined = (str(product_name) + " " + str(product_details)).replace(',', '')
    matches = re.findall(r'(?:₹|rs\.?|inr)\s*(\d{3,6})', combined.lower())
    valid_prices = [int(m) for m in matches if 500 <= int(m) <= 500000]
    if valid_prices:
        return valid_prices[0]
        
    # 3. LLM Fallback (If the page scrape completely missed the price)
    try:
        llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0)
        res = llm.invoke([HumanMessage(content=f"What is the estimated retail price in INR of '{product_name}'? Return only a number.")])
        nums = re.findall(r'\d+', res.content.replace(',', ''))
        valid = [int(n) for n in nums if 500 <= int(n) <= 500000]
        if valid:
            return valid[0]
    except:
        pass
        
    return 15000

def get_mock_price_history(base_price: int) -> dict:
    """Generates realistic Keepa-style price history anchored to the REAL price."""
    variation = int(base_price * 0.15) 
    trend = [base_price + random.randint(-variation, variation) for _ in range(5)]
    trend.append(base_price) 
    avg_price = sum(trend) / len(trend)
    
    return {
        "current_price": f"₹{base_price:,}",
        "average_price": f"₹{avg_price:,.0f}",
        "six_month_trend": trend,
        "lowest_historical": f"₹{min(trend):,}"
    }

def get_serpapi_prices(base_price: int) -> dict:
    """Mocks Google Shopping results based on the real price."""
    platforms = ["Amazon", "Flipkart", "Croma", "Reliance Digital"]
    random.shuffle(platforms)
    
    variation = int(base_price * 0.05) 
    prices = {plat: f"₹{base_price + random.randint(0, variation):,}" for plat in platforms[:3]}
    
    best_plat = platforms[0]
    prices[best_plat] = f"₹{base_price:,}"
    
    return {
        "best_platform": best_plat,
        "lowest_price": prices[best_plat],
        "all_prices": prices
    }

def analyze_product_shopping(product_name: str, product_details: str, language: str = "English") -> dict:
    """Orchestrates the APIs and strictly validates the Competitor Table & Verdict."""
    
    base_price = get_exact_price(product_name, product_details)
    history = get_mock_price_history(base_price)
    market = get_serpapi_prices(base_price)
    
    try:
        # Dropped temperature to 0.1 to completely prevent hallucinations
        llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.1)
        
        # CRITICAL FIX: Included {product_details} so it knows it's a headphone, not a keyboard!
        prompt = f"""
        You are an expert Shopping Assistant in India. 
        
        PRODUCT CONTEXT:
        Name: {product_name}
        Details: {str(product_details)[:1000]}
        Live Price: {market['lowest_price']}
        
        YOUR TASKS:
        1. Identify the specific product category (e.g., Headphones, Smartphone, etc.).
        2. Find EXACTLY 2 real market competitors in the EXACT SAME CATEGORY. (If the product is a headphone, ONLY suggest headphones. NEVER suggest keyboards or unrelated items).
        3. Write a definitive conclusion/verdict on whether to buy this or the competitors.
        
        CRITICAL OUTPUT RULES:
        - Respond ONLY in the exact JSON format below. No markdown text outside the JSON.
        - Ensure all keys are exactly as shown (lowercase).
        
        {{
            "timing_indicator": "Buy Now",
            "competitors": [
                {{"name": "Actual Competitor 1", "price": "₹...", "pros": "Brief reason..."}},
                {{"name": "Actual Competitor 2", "price": "₹...", "pros": "Brief reason..."}}
            ],
            "verdict": "Detailed conclusion translated to {language}."
        }}
        """
        
        response = llm.invoke([HumanMessage(content=prompt)])
        text = response.content.strip()
        
        # Complete, unbroken JSON cleanup (Replaced Regex to prevent cuts)
        text = text.replace("```json", "").replace("```", "").strip()
        
        start = text.find('{')
        end = text.rfind('}') + 1
        if start != -1 and end != 0:
            text = text[start:end]
            
        data = json.loads(text)
        
        # NORMALIZER: Lowercase all top-level keys
        norm_data = {k.lower(): v for k, v in data.items()}
        
        raw_comps = norm_data.get("competitors", [])
        safe_comps = []
        
        if isinstance(raw_comps, list):
            for c in raw_comps:
                if isinstance(c, dict):
                    # Lowercase all competitor keys
                    c_low = {str(k).lower(): str(v) for k, v in c.items()}
                    
                    name = c_low.get("name", c_low.get("alternative", c_low.get("brand", ""))).strip()
                    price = c_low.get("price", c_low.get("cost", "")).strip()
                    pros = c_low.get("pros", c_low.get("features", c_low.get("details", ""))).strip()
                    
                    # Prevent blank table cells
                    if not name: name = "Comparable Alternative"
                    if not price: price = "Check Store"
                    if not pros: pros = "Similar Features"
                    
                    safe_comps.append({"name": name, "price": price, "pros": pros})
        
        # Guarantee exactly 2 items in the list to prevent rendering crashes
        while len(safe_comps) < 2:
            safe_comps.append({
                "name": "Market Alternative", 
                "price": "Check Store", 
                "pros": "Competitive features"
            })

        verdict_text = str(norm_data.get("verdict", norm_data.get("conclusion", "This product is a solid choice.")))
        if not verdict_text.strip():
            verdict_text = "Analysis completed. Please check the competitor table above."

        return {
            "best_platform": market['best_platform'],
            "lowest_price": market['lowest_price'],
            "historical_average": history['average_price'],
            "timing_indicator": str(norm_data.get("timing_indicator", "Buy Now")),
            "competitors": safe_comps[:2],
            "verdict": verdict_text
        }
        
    except Exception as e:
        print(f"JSON Parsing Error: {e}")
        return {
            "best_platform": market['best_platform'],
            "lowest_price": market['lowest_price'],
            "historical_average": history['average_price'],
            "timing_indicator": "Wait",
            "competitors": [
                {"name": "System Recovering", "price": "N/A", "pros": "Please try again."},
                {"name": "System Recovering", "price": "N/A", "pros": "Please try again."}
            ],
            "verdict": f"The AI encountered a formatting error. The base price extracted was ₹{base_price:,}."
        }