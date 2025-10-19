// ai_sim.js
// Simple local LLM/AI simulation for kid-friendly teaching.

export default class AISim{
  constructor(){
    this.examples = []; // training examples: {label, text}
    this.recentTokens = []; // context window
    this.maxContext = 6;
    this.styleScores = {}; // counts per label
  }

  addExample(label, text){
    this.examples.push({label, text});
    this.styleScores[label] = (this.styleScores[label]||0) + 1;
  }

  feedTokens(tokens){
    // tokens = array of strings
    this.recentTokens.push(...tokens);
    if(this.recentTokens.length>this.maxContext) this.recentTokens = this.recentTokens.slice(-this.maxContext);
  }

  // rudimentary 'response' generator: uses tokens + learned style
  respond(){
    // prefer label with highest score
    const topStyle = Object.keys(this.styleScores).sort((a,b)=>this.styleScores[b]-this.styleScores[a])[0] || 'neutral';
    const tokenText = this.recentTokens.join(' ');
    // some playful heuristics for kids
    if(tokenText.length===0) return `Hello! Give me some seeds to make a sentence!`;
    if(topStyle === 'happy') return `I feel happy when I hear: ${tokenText} 😊`;
    if(topStyle === 'sad') return `That sounds a bit sad: ${tokenText} 💧`;
    if(topStyle === 'robot') return `ROBOT RESPONSE: ${tokenText.toUpperCase()}`;
    // fallback fun response: mirror with small change
    return `You said: ${tokenText}. I like that!`;
  }
}
