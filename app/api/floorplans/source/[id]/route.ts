import {currentUser} from "@/lib/auth";
import {planSource} from "@/lib/floorplan/catalog";
import {sourceImage} from "@/lib/floorplan/source-image";
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
  const user=await currentUser(),{id}=await params;
  if(user?.role!=="customer"||!planSource(id))return new Response(null,{status:404});
  try{
    const bytes=await sourceImage(id);
    return new Response(new Uint8Array(bytes),{headers:{"Content-Type":"image/png","Cache-Control":"private, max-age=300","X-Content-Type-Options":"nosniff"}});
  }catch{return new Response(null,{status:502});}
}
