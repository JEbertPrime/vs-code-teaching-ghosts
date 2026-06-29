/**
 * 2^{15} = 32768 and the sum of its digits is 3 + 2 + 7 + 6 + 8 = 26.<
    What is the sum of the digits of the number 2^{1000}?<
 */

function powerSum(num:number){
    let result:number =0
    let bigIntNum = BigInt(num) 
    let exponented = 2n**bigIntNum
    exponented.toString().split('').forEach((char:string)=>result+=Number(char))  
    return result
}